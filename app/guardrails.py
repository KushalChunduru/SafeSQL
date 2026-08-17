"""Safety middleware: every LLM-generated SQL string passes through here
before it is allowed anywhere near the database.

Each rule is independently toggleable via Settings and every block is logged
(reason, timestamp, question, rejected SQL) for auditability.
"""
import logging
import re
import time
from dataclasses import dataclass, field

import sqlparse
from sqlalchemy import Engine, text
from sqlparse.sql import Statement
from sqlparse.tokens import DDL, DML

from app.config import get_settings
from app.models import GuardrailViolation

logger = logging.getLogger("safesql.guardrails")

BLOCKED_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "GRANT", "REVOKE", "REPLACE", "MERGE", "ATTACH", "DETACH", "COPY",
    "EXEC", "EXECUTE", "CALL", "VACUUM", "PRAGMA", "SET",
}

AUDIT_LOG: list[dict] = []


def _audit(question: str, sql: str, violations: list[GuardrailViolation]):
    for v in violations:
        entry = {
            "timestamp": time.time(),
            "question": question,
            "sql": sql,
            "rule": v.rule,
            "reason": v.reason,
            "severity": v.severity,
        }
        AUDIT_LOG.append(entry)
        logger.warning("GUARDRAIL %s: %s | question=%r sql=%r", v.severity.upper(), v.reason, question, sql)


@dataclass
class GuardrailResult:
    sql: str  # possibly modified (e.g. LIMIT injected)
    allowed: bool
    violations: list = field(default_factory=list)  # list[GuardrailViolation]


def _statement_count(sql: str) -> int:
    return len([s for s in sqlparse.split(sql) if s.strip()])


def _is_select_only(parsed: Statement) -> tuple[bool, str | None]:
    for token in parsed.flatten():
        if token.ttype in (DDL, DML):
            word = token.value.upper()
            if word in BLOCKED_KEYWORDS or (token.ttype is DML and word != "SELECT"):
                return False, word
    first_keyword = None
    for token in parsed.tokens:
        if not token.is_whitespace:
            first_keyword = token.value.upper()
            break
    if first_keyword not in ("SELECT", "WITH"):
        return False, first_keyword
    return True, None


def _max_paren_depth(sql: str) -> int:
    depth = 0
    max_depth = 0
    for ch in sql:
        if ch == "(":
            depth += 1
            max_depth = max(max_depth, depth)
        elif ch == ")":
            depth = max(0, depth - 1)
    return max_depth


def _has_limit(sql: str) -> bool:
    return re.search(r"\blimit\s+\d+", sql, re.IGNORECASE) is not None


def _inject_limit(sql: str, limit: int) -> str:
    stripped = sql.rstrip().rstrip(";")
    return f"{stripped} LIMIT {limit};"


def _explain_row_estimate(engine: Engine, sql: str) -> int | None:
    """Best-effort: parse an estimated row count out of EXPLAIN output.
    Returns None if unavailable (e.g. DuckDB plans without a numeric
    estimate) rather than blocking on uncertainty."""
    try:
        with engine.connect() as conn:
            plan_rows = conn.execute(text(f"EXPLAIN {sql.rstrip(';')}")).fetchall()
        plan_text = "\n".join(str(r) for r in plan_rows)
        # Postgres: "... rows=12345 ..."
        m = re.search(r"rows=(\d+)", plan_text)
        if m:
            return int(m.group(1))
        # DuckDB: "~12345 Rows"
        m = re.search(r"~?([\d,]+)\s*Rows", plan_text, re.IGNORECASE)
        if m:
            return int(m.group(1).replace(",", ""))
        return None
    except Exception as e:
        logger.info("EXPLAIN guardrail could not run: %s", e)
        return None


def apply_guardrails(sql: str, question: str, engine: Engine | None = None) -> GuardrailResult:
    s = get_settings()
    violations: list[GuardrailViolation] = []
    working_sql = sql.strip()

    if _statement_count(working_sql) != 1:
        violations.append(GuardrailViolation(
            rule="single_statement", reason="Only a single SQL statement is allowed.", severity="blocked"))
        _audit(question, sql, violations)
        return GuardrailResult(sql=working_sql, allowed=False, violations=violations)

    parsed = sqlparse.parse(working_sql)[0]
    is_select, bad_word = _is_select_only(parsed)
    if not is_select:
        violations.append(GuardrailViolation(
            rule="read_only",
            reason=f"Statement type '{bad_word}' is not allowed. Only SELECT/WITH queries are permitted.",
            severity="blocked",
        ))
        _audit(question, sql, violations)
        return GuardrailResult(sql=working_sql, allowed=False, violations=violations)

    depth = _max_paren_depth(working_sql)
    if depth > s.max_subquery_depth:
        violations.append(GuardrailViolation(
            rule="subquery_depth",
            reason=f"Nesting depth {depth} exceeds max allowed {s.max_subquery_depth}.",
            severity="blocked",
        ))
        _audit(question, sql, violations)
        return GuardrailResult(sql=working_sql, allowed=False, violations=violations)

    if not _has_limit(working_sql):
        working_sql = _inject_limit(working_sql, s.max_row_limit)
        violations.append(GuardrailViolation(
            rule="row_limit",
            reason=f"No LIMIT specified; auto-injected LIMIT {s.max_row_limit}.",
            severity="warning",
        ))

    if s.enable_explain_guardrail and engine is not None:
        estimate = _explain_row_estimate(engine, working_sql)
        if estimate is not None and estimate > s.max_explain_row_estimate:
            violations.append(GuardrailViolation(
                rule="explain_row_estimate",
                reason=f"EXPLAIN estimates {estimate} rows scanned, exceeding max {s.max_explain_row_estimate}.",
                severity="blocked",
            ))
            _audit(question, sql, violations)
            return GuardrailResult(sql=working_sql, allowed=False, violations=violations)

    warnings_only = [v for v in violations if v.severity == "warning"]
    if warnings_only:
        _audit(question, sql, warnings_only)

    return GuardrailResult(sql=working_sql, allowed=True, violations=violations)
