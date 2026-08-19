"""CSV/Excel dataset import — lets a user load their own data into the
sandboxed database alongside the seeded e-commerce schema. Imported tables
are ordinary tables: the existing guardrail/read-only-execution layer covers
them with no special-casing.
"""
import io
import re
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import text

from app.config import get_settings
from app.db import dispose_and_reset, get_app_engine, get_reader_engine
from app.models import DatasetImportResponse, DatasetInfo

BASE_TABLES = {"customers", "categories", "products", "orders", "order_items", "reviews"}
UPLOADS_META_TABLE = "_safesql_uploads"


class DatasetImportError(Exception):
    pass


def _sanitize_identifier(raw: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", raw).strip("_").lower()
    if not cleaned or not re.match(r"^[a-z_]", cleaned):
        cleaned = f"{fallback}_{cleaned}" if cleaned else fallback
    return cleaned


def _sanitize_table_name(raw: str) -> str:
    stem = re.sub(r"\.[^.]+$", "", raw)
    return f"user_{_sanitize_identifier(stem, 'dataset')}"[:63]


def _ensure_meta_table(conn) -> None:
    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {UPLOADS_META_TABLE} (
            table_name VARCHAR PRIMARY KEY,
            original_filename VARCHAR,
            row_count INTEGER,
            imported_at VARCHAR
        )
    """))


def import_dataset(file_bytes: bytes, filename: str, table_name: str | None = None) -> DatasetImportResponse:
    s = get_settings()
    max_bytes = s.max_upload_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise DatasetImportError(f"File exceeds the {s.max_upload_mb}MB upload limit.")

    lower = filename.lower()
    try:
        if lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        elif lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_bytes))
        else:
            raise DatasetImportError("Only .csv, .xlsx, or .xls files are supported.")
    except DatasetImportError:
        raise
    except Exception as e:
        raise DatasetImportError(f"Could not parse file: {e}")

    if df.empty:
        raise DatasetImportError("File contains no rows.")

    resolved_name = _sanitize_table_name(table_name or filename)
    if resolved_name in BASE_TABLES:
        raise DatasetImportError(f"Table name '{resolved_name}' collides with a built-in table.")

    # Column names are user-controlled (CSV header) — sanitize defensively even
    # though pandas/SQLAlchemy quote identifiers on write.
    seen: dict[str, int] = {}
    clean_cols = []
    for i, c in enumerate(df.columns):
        base = _sanitize_identifier(str(c), f"col_{i}")
        n = seen.get(base, 0)
        seen[base] = n + 1
        clean_cols.append(base if n == 0 else f"{base}_{n}")
    df.columns = clean_cols

    dispose_and_reset()
    try:
        engine = get_app_engine()
        with engine.begin() as conn:
            df.to_sql(resolved_name, conn, if_exists="replace", index=False)
            _ensure_meta_table(conn)
            conn.execute(text(f"DELETE FROM {UPLOADS_META_TABLE} WHERE table_name = :name"), {"name": resolved_name})
            conn.execute(
                text(f"""
                    INSERT INTO {UPLOADS_META_TABLE} (table_name, original_filename, row_count, imported_at)
                    VALUES (:name, :fname, :rows, :ts)
                """),
                {
                    "name": resolved_name,
                    "fname": filename,
                    "rows": len(df),
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
    finally:
        dispose_and_reset()

    return DatasetImportResponse(table_name=resolved_name, row_count=len(df), columns=list(df.columns))


def delete_dataset(table_name: str) -> None:
    if not re.match(r"^[a-z_][a-zA-Z0-9_]*$", table_name):
        raise DatasetImportError(f"'{table_name}' is not a valid table name.")

    engine = get_reader_engine()
    with engine.connect() as conn:
        tracked = conn.execute(
            text(f"SELECT 1 FROM {UPLOADS_META_TABLE} WHERE table_name = :t"),
            {"t": table_name},
        ).scalar() if conn.execute(
            text("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = :t"),
            {"t": UPLOADS_META_TABLE},
        ).scalar() else None

    if not tracked:
        raise DatasetImportError(f"'{table_name}' is not an imported dataset.")

    dispose_and_reset()
    try:
        engine = get_app_engine()
        with engine.begin() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
            conn.execute(text(f"DELETE FROM {UPLOADS_META_TABLE} WHERE table_name = :t"), {"t": table_name})
    finally:
        dispose_and_reset()


def list_datasets() -> list[DatasetInfo]:
    engine = get_reader_engine()
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = :t"),
                {"t": UPLOADS_META_TABLE},
            ).scalar()
            if not exists:
                return []
            rows = conn.execute(
                text(f"SELECT table_name, original_filename, row_count, imported_at FROM {UPLOADS_META_TABLE}")
            ).fetchall()
            result = []
            for table_name, original_filename, row_count, imported_at in rows:
                try:
                    cols = list(conn.execute(text(f"SELECT * FROM {table_name} LIMIT 0")).keys())
                except Exception:
                    cols = []
                result.append(DatasetInfo(
                    table_name=table_name, original_filename=original_filename,
                    row_count=row_count, columns=cols, imported_at=imported_at,
                ))
            return result
    except Exception:
        return []
