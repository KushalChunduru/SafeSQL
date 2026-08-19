"""SQLAlchemy engine factory.

Two engines are exposed:
  - app engine: read/write, used only by data/seed.py to build the sample DB.
  - reader engine: used by everything that executes LLM-generated SQL. On
    Postgres this connects as a dedicated SELECT-only role; on DuckDB it opens
    the database file in read_only mode. Either way, a write statement that
    slips past the guardrail layer still cannot succeed at the DB layer.
"""
from functools import lru_cache
from pathlib import Path

from sqlalchemy import Engine, create_engine

from app.config import get_settings


def _postgres_url(user: str, password: str) -> str:
    s = get_settings()
    return f"postgresql+psycopg2://{user}:{password}@{s.postgres_host}:{s.postgres_port}/{s.postgres_db}"


@lru_cache
def get_app_engine() -> Engine:
    """Read/write engine — only used for seeding and schema setup."""
    s = get_settings()
    if s.db_backend == "postgres":
        return create_engine(_postgres_url(s.postgres_user, s.postgres_password))
    Path(s.duckdb_abs_path).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(f"duckdb:///{s.duckdb_abs_path}")


@lru_cache
def get_reader_engine() -> Engine:
    """Read-only engine — the only engine the query executor is allowed to use."""
    s = get_settings()
    if s.db_backend == "postgres":
        return create_engine(_postgres_url(s.postgres_readonly_user, s.postgres_readonly_password))
    return create_engine(
        f"duckdb:///{s.duckdb_abs_path}",
        connect_args={"read_only": True},
    )


def reset_engine_cache() -> None:
    """Used by tests/seed script after the DB file is (re)created."""
    get_app_engine.cache_clear()
    get_reader_engine.cache_clear()


def dispose_and_reset() -> None:
    """Closes any pooled connections on both engines and clears the cache so
    the next call opens fresh ones.

    DuckDB requires exclusive access for a read-write connection and won't
    open one while another connection (even read-only) already has the file
    open. Since get_reader_engine() is cached and its pooled connection can
    stay open between requests, a dataset import must call this immediately
    before opening a write connection, and again afterward so subsequent
    requests get a reader engine that sees the newly-imported table. This is
    a single-process assumption — fine for this project's dev/demo scope, not
    a substitute for real concurrent-write handling under load.
    """
    for factory in (get_app_engine, get_reader_engine):
        try:
            factory().dispose()
        except Exception:
            pass
    reset_engine_cache()
