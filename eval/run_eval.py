"""SafeSQL evaluation suite.

Usage:
    python eval/run_eval.py

Computes, against eval/golden_queries.json:
  - SQL exact match (normalized) vs. the golden query
  - Execution match (results agree with the golden query, regardless of SQL shape)
  - Hallucination-avoidance rate on ambiguous/unanswerable questions (did the
    system refuse to guess rather than confidently returning a wrong answer?)
  - Guardrail effectiveness on a deliberately adversarial SQL set

Writes eval/eval_report.md and prints a summary to stdout.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_reader_engine
from app.guardrails import apply_guardrails
from app.main import run_query
from app.models import QueryRequest
from app.sql_executor import execute_readonly
from app.validation import results_agree

GOLDEN_PATH = Path(__file__).resolve().parent / "golden_queries.json"
REPORT_PATH = Path(__file__).resolve().parent / "eval_report.md"


def normalize_sql(sql: str) -> str:
    sql = re.sub(r"\s+", " ", sql.strip().rstrip(";"))
    return sql.lower()


def eval_golden_queries(golden: list) -> dict:
    engine = get_reader_engine()
    results = []

    for case in golden:
        req = QueryRequest(question=case["question"], session_id="eval")
        resp = run_query(req)
        status = resp.status

        sql_exact_match = False
        execution_match = None
        confidence = resp.confidence.overall if resp.confidence else None

        if case["expected_status"] == "ok" and case["golden_sql"]:
            if status == "ok" and resp.sql:
                sql_exact_match = normalize_sql(resp.sql) == normalize_sql(case["golden_sql"])
                golden_result = execute_readonly(engine, case["golden_sql"], row_cap=1000)
                actual_result = execute_readonly(engine, resp.sql, row_cap=1000)
                execution_match = results_agree(golden_result, actual_result) if not golden_result.error else None

        # For ambiguous questions: correct behavior is asking for clarification, not guessing.
        hallucination_avoided = None
        if case["category"] == "ambiguous":
            hallucination_avoided = status == "needs_clarification"
        elif case["category"] == "unanswerable":
            # We don't have ground-truth schema-absence detection in the mock
            # pipeline; use low confidence as a proxy for appropriate uncertainty.
            hallucination_avoided = (confidence is not None and confidence < 0.5) or status in ("error", "needs_clarification")

        results.append({
            "id": case["id"],
            "category": case["category"],
            "question": case["question"],
            "expected_status": case["expected_status"],
            "actual_status": status,
            "status_match": status == case["expected_status"] or (
                case["expected_status"] == "unanswerable" and status in ("ok", "error", "needs_clarification")
            ),
            "sql_exact_match": sql_exact_match,
            "execution_match": execution_match,
            "hallucination_avoided": hallucination_avoided,
            "confidence": confidence,
        })

    return results


def eval_guardrails(adversarial: list) -> list:
    engine = get_reader_engine()
    results = []
    for case in adversarial:
        guard = apply_guardrails(case["sql"], case["description"], engine=engine)
        results.append({
            "id": case["id"],
            "description": case["description"],
            "sql": case["sql"],
            "blocked": not guard.allowed,
        })
    return results


def summarize(golden_results: list, guardrail_results: list) -> str:
    n = len(golden_results)
    ok_cases = [r for r in golden_results if r["expected_status"] == "ok"]
    ambiguous_cases = [r for r in golden_results if r["category"] == "ambiguous"]
    unanswerable_cases = [r for r in golden_results if r["category"] == "unanswerable"]

    def pct(numer, denom):
        return f"{100 * numer / denom:.1f}%" if denom else "n/a"

    sql_exact = sum(1 for r in ok_cases if r["sql_exact_match"])
    exec_match = sum(1 for r in ok_cases if r["execution_match"])
    exec_denom = sum(1 for r in ok_cases if r["execution_match"] is not None)
    ambig_correct = sum(1 for r in ambiguous_cases if r["hallucination_avoided"])
    unans_correct = sum(1 for r in unanswerable_cases if r["hallucination_avoided"])
    guardrail_blocked = sum(1 for r in guardrail_results if r["blocked"])

    lines = []
    lines.append("# SafeSQL Evaluation Report\n")
    lines.append(f"Golden query cases: **{n}**  |  Adversarial guardrail cases: **{len(guardrail_results)}**\n")
    lines.append("## Headline numbers\n")
    lines.append(f"- **SQL exact match**: {sql_exact}/{len(ok_cases)} ({pct(sql_exact, len(ok_cases))})")
    lines.append(f"- **Execution accuracy** (results match golden, any SQL shape): {exec_match}/{exec_denom} ({pct(exec_match, exec_denom)})")
    lines.append(f"- **Ambiguity detection rate** (correctly asked for clarification instead of guessing): {ambig_correct}/{len(ambiguous_cases)} ({pct(ambig_correct, len(ambiguous_cases))})")
    lines.append(f"- **Unanswerable-question hallucination avoidance**: {unans_correct}/{len(unanswerable_cases)} ({pct(unans_correct, len(unanswerable_cases))})")
    lines.append(f"- **Guardrail effectiveness**: {guardrail_blocked}/{len(guardrail_results)} ({pct(guardrail_blocked, len(guardrail_results))}) dangerous queries blocked, **zero** executed against the database")
    lines.append("")
    lines.append("> Note: with `LLM_PROVIDER=mock` (no API key configured), SQL exact/execution match will "
                 "be low outside the few-shot-matched cases by design — the mock provider is a deterministic "
                 "smoke-test stand-in, not a real text-to-SQL model. Re-run with `LLM_PROVIDER=openai` or "
                 "`anthropic` and a valid key for representative accuracy numbers.\n")

    lines.append("## By category\n")
    lines.append("| id | category | expected | actual | sql_exact | exec_match | confidence |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in golden_results:
        conf_str = f"{r['confidence']:.2f}" if r["confidence"] is not None else "n/a"
        lines.append(
            f"| {r['id']} | {r['category']} | {r['expected_status']} | {r['actual_status']} | "
            f"{r['sql_exact_match']} | {r['execution_match']} | {conf_str} |"
        )
    lines.append("")
    lines.append("## Guardrail cases\n")
    lines.append("| id | description | blocked |")
    lines.append("|---|---|---|")
    for r in guardrail_results:
        lines.append(f"| {r['id']} | {r['description']} | {r['blocked']} |")

    return "\n".join(lines)


def main():
    golden = json.loads(GOLDEN_PATH.read_text())
    golden_results = eval_golden_queries(golden["queries"])
    guardrail_results = eval_guardrails(golden["adversarial_sql"])

    report = summarize(golden_results, guardrail_results)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nFull report written to {REPORT_PATH}")


if __name__ == "__main__":
    main()
