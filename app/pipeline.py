"""The core question -> SQL -> validated answer pipeline.

Shared by POST /v1/query and POST /v1/query/refine so that a follow-up
refinement goes through the exact same guardrail, sandboxed-execution, and
hallucination-detection path as a brand-new question - nothing about
refinement (or self-correction, below) is allowed to shortcut safety.
"""
import logging

from app import history
from app.confidence import compute_confidence
from app.config import get_settings
from app.db import get_reader_engine
from app.guardrails import apply_guardrails
from app.llm_client import get_llm_client
from app.models import (
    ClarificationNeeded, CorrectionAttempt, GuardrailViolation, Interpretation, QueryResponse,
)
from app.prompts import AMBIGUOUS_TERMS, build_ambiguity_check
from app.schema_filter import build_filtered_schema
from app.schema_introspect import get_schema
from app.sql_executor import execute_readonly
from app.validation import run_sanity_checks, schema_coverage_score, score_alignment, results_agree

logger = logging.getLogger("safesql.pipeline")


def execute_query(
    question: str,
    session_id: str,
    *,
    allow_clarification: bool = True,
    force_interpretation: str | None = None,
    prior_sql: str | None = None,
) -> QueryResponse:
    s = get_settings()
    engine = get_reader_engine()
    schema = get_schema(engine)

    if allow_clarification and not force_interpretation:
        term = build_ambiguity_check(question)
        if term:
            interpretations = [Interpretation(**i) for i in AMBIGUOUS_TERMS[term]]
            response = QueryResponse(
                status="needs_clarification",
                question=question,
                clarification=ClarificationNeeded(ambiguous_term=term, interpretations=interpretations),
            )
            history.record(session_id, question, response)
            return response

    effective_question = question
    if force_interpretation:
        effective_question = f"{question} (interpreting the ambiguous term as: {force_interpretation})"

    filtered_schema = build_filtered_schema(effective_question, schema)
    llm = get_llm_client()

    try:
        generation = llm.generate_sql(effective_question, filtered_schema, variant="primary", prior_sql=prior_sql)
    except Exception as e:
        logger.exception("LLM generation failed")
        response = QueryResponse(status="error", question=question, error=f"SQL generation failed: {e}")
        history.record(session_id, question, response)
        return response

    guard = apply_guardrails(generation.sql, question, engine=engine)
    if not guard.allowed:
        response = QueryResponse(
            status="blocked",
            question=question,
            sql=generation.sql,
            guardrail_warnings=[v for v in guard.violations],
        )
        history.record(session_id, question, response)
        return response

    warnings = [v for v in guard.violations if v.severity == "warning"]
    sql = guard.sql

    exec_result = execute_readonly(engine, sql, row_cap=s.max_row_limit)

    correction_history: list[CorrectionAttempt] = []
    attempts = 0
    if exec_result.error and s.enable_self_correction:
        last_error = exec_result.error
        last_sql = sql
        while attempts < s.max_self_correction_attempts and exec_result.error:
            correction_history.append(CorrectionAttempt(sql=last_sql, error=last_error))
            attempts += 1
            try:
                repair = llm.generate_sql(
                    effective_question, filtered_schema, variant="primary",
                    error_context={"previous_sql": last_sql, "error": last_error},
                )
            except Exception as e:
                logger.info("Self-correction generation failed: %s", e)
                break
            repair_guard = apply_guardrails(repair.sql, question, engine=engine)
            if not repair_guard.allowed:
                # A "corrected" query that turns out unsafe is a hard stop, not another retry.
                response = QueryResponse(
                    status="blocked",
                    question=question,
                    sql=repair.sql,
                    guardrail_warnings=list(repair_guard.violations),
                    self_corrected=True,
                    correction_attempts=attempts,
                    correction_history=correction_history,
                )
                history.record(session_id, question, response)
                return response
            warnings = [v for v in repair_guard.violations if v.severity == "warning"]
            sql = repair_guard.sql
            generation = repair
            exec_result = execute_readonly(engine, sql, row_cap=s.max_row_limit)
            last_error = exec_result.error
            last_sql = sql

    if exec_result.error:
        response = QueryResponse(
            status="error", question=question, sql=sql,
            guardrail_warnings=warnings, error=exec_result.error,
            self_corrected=attempts > 0, correction_attempts=attempts, correction_history=correction_history,
        )
        history.record(session_id, question, response)
        return response

    # --- hallucination detection ---
    try:
        reconstructed = llm.back_translate(sql)
    except Exception:
        reconstructed = ""
    alignment = score_alignment(question, reconstructed) if reconstructed else 0.5

    sanity_flags = run_sanity_checks(exec_result)
    sanity_pass_rate = 1.0 if not sanity_flags else max(0.0, 1 - 0.25 * len(sanity_flags))

    coverage = schema_coverage_score(question, generation.tables_used, sql)

    multi_agreement = None
    alternate_sql = None
    alternate_agreement = None
    if s.enable_multi_query_validation:
        try:
            alt_generation = llm.generate_sql(
                effective_question, filtered_schema, variant="alternate", prior_sql=prior_sql,
            )
            alt_guard = apply_guardrails(alt_generation.sql, question, engine=engine)
            if alt_guard.allowed:
                alt_result = execute_readonly(engine, alt_guard.sql, row_cap=s.max_row_limit)
                agree = results_agree(exec_result, alt_result)
                multi_agreement = 1.0 if agree else 0.0
                alternate_sql = alt_guard.sql
                alternate_agreement = agree
        except Exception:
            logger.info("Multi-query validation skipped due to error", exc_info=True)

    confidence = compute_confidence(
        syntax_valid=True,
        back_translation_alignment=alignment,
        sanity_check_pass_rate=sanity_pass_rate,
        schema_coverage_score=coverage,
        multi_query_agreement=multi_agreement,
    )

    response = QueryResponse(
        status="ok",
        question=question,
        sql=sql,
        explanation=generation.explanation,
        columns=exec_result.columns,
        rows=exec_result.rows,
        row_count=exec_result.row_count,
        truncated=exec_result.truncated,
        execution_time_ms=exec_result.execution_time_ms,
        confidence=confidence,
        sanity_flags=sanity_flags,
        guardrail_warnings=warnings,
        alternate_sql=alternate_sql,
        alternate_agreement=alternate_agreement,
        self_corrected=attempts > 0,
        correction_attempts=attempts,
        correction_history=correction_history,
    )
    history.record(session_id, question, response)
    return response
