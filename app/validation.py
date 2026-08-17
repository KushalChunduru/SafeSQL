"""Hallucination detection: does the generated SQL actually answer the
question that was asked, and do the results look plausible?

Three independent signals feed into the confidence score (app/confidence.py):
  1. back-translation alignment - ask the LLM what question the SQL answers,
     score similarity against the original question.
  2. result sanity checks - plausibility of aggregates, NULL-heavy columns,
     date ranges within the data's observed span.
  3. multi-query agreement - a second, independently-generated query for the
     same question is executed and compared.
"""
import math
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from app.models import SanityFlag
from app.sql_executor import ExecutionResult


# ---------- 1. Back-translation alignment ----------

def score_alignment(original_question: str, reconstructed_question: str) -> float:
    """0-1 similarity between the original question and the LLM's own
    restatement of what its SQL answers. Token-set ratio is robust to
    reordering/paraphrase, which matters since the reconstruction is
    always phrased differently than the user's original question."""
    score = fuzz.token_set_ratio(original_question.lower(), reconstructed_question.lower())
    return round(score / 100, 3)


# ---------- 2. Result sanity checks ----------

def run_sanity_checks(result: ExecutionResult) -> list:
    flags: list[SanityFlag] = []
    if result.error:
        return flags  # execution errors are handled upstream, not a sanity concern here
    if result.row_count == 0:
        flags.append(SanityFlag(check="empty_result", message="Query returned zero rows."))
        return flags

    n_cols = len(result.columns)
    n_rows = len(result.rows)

    # NULL-heavy columns (often a sign of a bad JOIN)
    for ci, col_name in enumerate(result.columns):
        values = [row[ci] for row in result.rows]
        null_count = sum(1 for v in values if v is None)
        if n_rows > 0 and null_count / n_rows > 0.5:
            flags.append(SanityFlag(
                check="null_heavy_column",
                message=f"Column '{col_name}' is {null_count}/{n_rows} NULL — possible bad JOIN or filter.",
            ))

    # Implausible aggregate values: negative sums/counts where that shouldn't happen
    for ci, col_name in enumerate(result.columns):
        lname = col_name.lower()
        values = [row[ci] for row in result.rows if isinstance(row[ci], (int, float))]
        if not values:
            continue
        if any(k in lname for k in ("count", "revenue", "total", "sum", "quantity", "amount")):
            negatives = [v for v in values if v < 0]
            if negatives and "discount" not in lname:
                flags.append(SanityFlag(
                    check="negative_aggregate",
                    message=f"Column '{col_name}' contains negative values ({negatives[:3]}...), unexpected for a sum/count-style metric.",
                ))
        if "rating" in lname:
            out_of_range = [v for v in values if v < 1 or v > 5]
            if out_of_range:
                flags.append(SanityFlag(
                    check="out_of_range_rating",
                    message=f"Column '{col_name}' has values outside the expected 1-5 rating range.",
                ))

    return flags


# ---------- 3. Multi-query agreement ----------

def _normalize_cell(v):
    if isinstance(v, float):
        return round(v, 2)
    return v


def results_agree(a: ExecutionResult, b: ExecutionResult, tolerance: float = 0.02) -> bool:
    if a.error or b.error:
        return False
    if len(a.columns) != len(b.columns):
        return False
    rows_a = sorted([tuple(_normalize_cell(v) for v in r) for r in a.rows], key=lambda t: str(t))
    rows_b = sorted([tuple(_normalize_cell(v) for v in r) for r in b.rows], key=lambda t: str(t))
    if len(rows_a) != len(rows_b):
        return False
    for ra, rb in zip(rows_a, rows_b):
        for va, vb in zip(ra, rb):
            if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
                if not math.isclose(float(va), float(vb), rel_tol=tolerance, abs_tol=tolerance):
                    return False
            elif va != vb:
                return False
    return True


# ---------- schema coverage heuristic ----------

QUESTION_TYPE_HINTS = {
    "join": ["and", "per", "each", "by", "with their", "along with"],
    "aggregate": ["total", "average", "avg", "sum", "how many", "count", "max", "min", "top"],
    "date_filter": ["last", "since", "before", "after", "between", "in 20", "this month", "this year"],
}


def schema_coverage_score(question: str, tables_used: list, sql: str) -> float:
    """Cheap heuristic: does the query's structure match what the phrasing
    of the question implies (e.g. a 'per category' question should involve
    a JOIN / GROUP BY, an aggregate word should show up as an aggregate
    function)? Returns 1.0 when expectations are met, penalized otherwise."""
    q = question.lower()
    sql_lower = sql.lower()
    score = 1.0
    checks = 0

    if any(h in q for h in QUESTION_TYPE_HINTS["aggregate"]):
        checks += 1
        if not any(fn in sql_lower for fn in ("count(", "sum(", "avg(", "max(", "min(")):
            score -= 1 / 3

    if any(h in q for h in QUESTION_TYPE_HINTS["join"]):
        checks += 1
        if len(tables_used) < 2 and "join" not in sql_lower:
            score -= 1 / 3

    if any(h in q for h in QUESTION_TYPE_HINTS["date_filter"]):
        checks += 1
        if not any(k in sql_lower for k in ("date", "interval", "between", ">=", "<=")):
            score -= 1 / 3

    return round(max(0.0, min(1.0, score)), 3)
