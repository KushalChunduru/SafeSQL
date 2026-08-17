"""Introspect the database into a structured schema the prompt engine can use.

Produces, per table: columns (name/type), primary keys, foreign keys, and
sample distinct values for low-cardinality columns (useful for disambiguating
things like status/country enums in the prompt).
"""
from dataclasses import dataclass, field
from functools import lru_cache

from sqlalchemy import Engine, inspect, text

LOW_CARDINALITY_SAMPLE_LIMIT = 12
LOW_CARDINALITY_MAX_DISTINCT = 15


@dataclass
class ColumnInfo:
    name: str
    type: str
    nullable: bool
    is_primary_key: bool
    sample_values: list = field(default_factory=list)


@dataclass
class ForeignKeyInfo:
    column: str
    ref_table: str
    ref_column: str


@dataclass
class TableInfo:
    name: str
    columns: list  # list[ColumnInfo]
    foreign_keys: list  # list[ForeignKeyInfo]
    description: str = ""


def _sample_values(engine: Engine, table: str, column: str) -> list:
    try:
        with engine.connect() as conn:
            distinct_count = conn.execute(
                text(f'SELECT COUNT(DISTINCT "{column}") FROM "{table}"')
            ).scalar()
            if distinct_count is None or distinct_count > LOW_CARDINALITY_MAX_DISTINCT:
                return []
            rows = conn.execute(
                text(f'SELECT DISTINCT "{column}" FROM "{table}" LIMIT {LOW_CARDINALITY_SAMPLE_LIMIT}')
            ).fetchall()
            return [r[0] for r in rows]
    except Exception:
        return []


# Business-glossary hints surfaced to the LLM prompt for tables/columns whose
# meaning isn't obvious from the name alone.
TABLE_DESCRIPTIONS = {
    "customers": "One row per registered customer.",
    "categories": "Product category lookup table.",
    "products": "Product catalog. unit_price is the current list price; cost is unit cost (for margin calculations).",
    "orders": "One row per order placed by a customer. status reflects the order lifecycle.",
    "order_items": "Line items within an order. unit_price is the price at time of sale (may differ from products.unit_price). "
                    "discount is an absolute dollar amount taken off this line. "
                    "gross revenue for a line = quantity * unit_price; net revenue = gross - discount.",
    "reviews": "Customer product reviews, rating is 1-5.",
}


def introspect_schema(engine: Engine) -> dict:
    """Returns {table_name: TableInfo} plus sample-value enrichment."""
    inspector = inspect(engine)
    tables: dict[str, TableInfo] = {}

    for table_name in inspector.get_table_names():
        pk_cols = set(inspector.get_pk_constraint(table_name).get("constrained_columns") or [])
        fk_list = []
        for fk in inspector.get_foreign_keys(table_name):
            for local_col, remote_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                fk_list.append(ForeignKeyInfo(column=local_col, ref_table=fk["referred_table"], ref_column=remote_col))

        columns = []
        for col in inspector.get_columns(table_name):
            sample = []
            if col["name"] not in pk_cols:
                sample = _sample_values(engine, table_name, col["name"])
            columns.append(ColumnInfo(
                name=col["name"],
                type=str(col["type"]),
                nullable=col.get("nullable", True),
                is_primary_key=col["name"] in pk_cols,
                sample_values=sample,
            ))

        tables[table_name] = TableInfo(
            name=table_name,
            columns=columns,
            foreign_keys=fk_list,
            description=TABLE_DESCRIPTIONS.get(table_name, ""),
        )

    return tables


def schema_to_dict(tables: dict) -> dict:
    """JSON-serializable view of the schema, for the GET /v1/schema endpoint."""
    out = {}
    for name, t in tables.items():
        out[name] = {
            "description": t.description,
            "columns": [
                {
                    "name": c.name,
                    "type": c.type,
                    "nullable": c.nullable,
                    "primary_key": c.is_primary_key,
                    "sample_values": c.sample_values,
                }
                for c in t.columns
            ],
            "foreign_keys": [
                {"column": fk.column, "references": f"{fk.ref_table}.{fk.ref_column}"}
                for fk in t.foreign_keys
            ],
        }
    return out


@lru_cache
def get_cached_schema(_engine_id: int, engine: Engine) -> dict:
    return introspect_schema(engine)


def get_schema(engine: Engine) -> dict:
    # cache key by engine identity since Engine isn't hashable-friendly across reloads
    return get_cached_schema(id(engine), engine)
