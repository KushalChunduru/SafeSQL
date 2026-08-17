"""Sandboxed execution of guardrail-approved SQL.

Defense in depth: the reader engine is already connected as a SELECT-only
role (Postgres) or an explicitly read-only file handle (DuckDB) — see
app/db.py. On top of that we always run inside a transaction we explicitly
roll back, so even a statement that somehow slipped past the guardrail layer
cannot persist a change.
"""
import time
from dataclasses import dataclass, field

from sqlalchemy import Engine, text


@dataclass
class ExecutionResult:
    columns: list
    rows: list
    row_count: int
    truncated: bool
    execution_time_ms: float
    error: str | None = None


def execute_readonly(engine: Engine, sql: str, row_cap: int) -> ExecutionResult:
    start = time.perf_counter()
    try:
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                result = conn.execute(text(sql))
                columns = list(result.keys())
                fetched = result.fetchmany(row_cap + 1)
                rows = [list(r) for r in fetched[:row_cap]]
                truncated = len(fetched) > row_cap
            finally:
                trans.rollback()
        elapsed_ms = (time.perf_counter() - start) * 1000
        return ExecutionResult(
            columns=columns, rows=rows, row_count=len(rows),
            truncated=truncated, execution_time_ms=round(elapsed_ms, 2),
        )
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return ExecutionResult(
            columns=[], rows=[], row_count=0, truncated=False,
            execution_time_ms=round(elapsed_ms, 2), error=str(e),
        )
