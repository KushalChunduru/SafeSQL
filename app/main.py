import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import history
from app.confidence import compute_confidence
from app.config import get_settings
from app.db import get_reader_engine
from app.guardrails import AUDIT_LOG, apply_guardrails
from app.llm_client import get_llm_client
from app.models import (
    ClarificationNeeded, FeedbackRequest, GuardrailViolation, Interpretation,
    QueryRequest, QueryResponse,
)
from app.prompts import AMBIGUOUS_TERMS, build_ambiguity_check
from app.schema_filter import build_filtered_schema
from app.schema_introspect import get_schema, schema_to_dict
from app.sql_executor import execute_readonly
from app.validation import (
    run_sanity_checks, schema_coverage_score, score_alignment, results_agree,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("safesql.api")

app = FastAPI(title="SafeSQL", description="Text-to-SQL with guardrails and hallucination detection")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/v1/health")
def health():
    return {"status": "ok"}


@app.get("/v1/schema")
def get_schema_endpoint():
    engine = get_reader_engine()
    schema = get_schema(engine)
    return schema_to_dict(schema)


@app.post("/v1/query", response_model=QueryResponse)
def run_query(req: QueryRequest):
    s = get_settings()
    engine = get_reader_engine()
    schema = get_schema(engine)

    if req.allow_clarification and not req.force_interpretation:
        term = build_ambiguity_check(req.question)
        if term:
            interpretations = [Interpretation(**i) for i in AMBIGUOUS_TERMS[term]]
            response = QueryResponse(
                status="needs_clarification",
                question=req.question,
                clarification=ClarificationNeeded(ambiguous_term=term, interpretations=interpretations),
            )
            history.record(req.session_id, req.question, response)
            return response

    effective_question = req.question
    if req.force_interpretation:
        effective_question = f"{req.question} (interpreting the ambiguous term as: {req.force_interpretation})"

    filtered_schema = build_filtered_schema(effective_question, schema)
    llm = get_llm_client()

    try:
        generation = llm.generate_sql(effective_question, filtered_schema, variant="primary")
    except Exception as e:
        logger.exception("LLM generation failed")
        response = QueryResponse(status="error", question=req.question, error=f"SQL generation failed: {e}")
        history.record(req.session_id, req.question, response)
        return response

    guard = apply_guardrails(generation.sql, req.question, engine=engine)
    if not guard.allowed:
        response = QueryResponse(
            status="blocked",
            question=req.question,
            sql=generation.sql,
            guardrail_warnings=[v for v in guard.violations],
        )
        history.record(req.session_id, req.question, response)
        return response

    warnings = [v for v in guard.violations if v.severity == "warning"]
    sql = guard.sql

    exec_result = execute_readonly(engine, sql, row_cap=s.max_row_limit)
    if exec_result.error:
        response = QueryResponse(
            status="error", question=req.question, sql=sql,
            guardrail_warnings=warnings, error=exec_result.error,
        )
        history.record(req.session_id, req.question, response)
        return response

    # --- hallucination detection ---
    try:
        reconstructed = llm.back_translate(sql)
    except Exception:
        reconstructed = ""
    alignment = score_alignment(req.question, reconstructed) if reconstructed else 0.5

    sanity_flags = run_sanity_checks(exec_result)
    sanity_pass_rate = 1.0 if not sanity_flags else max(0.0, 1 - 0.25 * len(sanity_flags))

    coverage = schema_coverage_score(req.question, generation.tables_used, sql)

    multi_agreement = None
    alternate_sql = None
    alternate_agreement = None
    if s.enable_multi_query_validation:
        try:
            alt_generation = llm.generate_sql(effective_question, filtered_schema, variant="alternate")
            alt_guard = apply_guardrails(alt_generation.sql, req.question, engine=engine)
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
        question=req.question,
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
    )
    history.record(req.session_id, req.question, response)
    return response


@app.get("/v1/audit")
def get_audit_log(limit: int = 50):
    """Recent guardrail activity (blocks + warnings), most recent first — the
    audit trail backing the Safety Dashboard's live feed."""
    return list(reversed(AUDIT_LOG[-limit:]))


@app.get("/v1/history")
def get_history_endpoint(session_id: str | None = None, limit: int = 50):
    return history.get_history(session_id=session_id, limit=limit)


@app.post("/v1/feedback")
def submit_feedback(req: FeedbackRequest):
    ok = history.add_feedback(req.query_id, req.correct, req.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="query_id not found")
    return {"status": "recorded"}
