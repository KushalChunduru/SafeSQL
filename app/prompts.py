"""Dynamic prompt construction: filtered schema + FK relationships + sample
values + business glossary + few-shot examples, assembled per question.

Domain-conditional by design: the hardcoded e-commerce few-shot examples and
ambiguity glossary below only apply when the seeded e-commerce tables are
actually present in the schema being prompted against. Any other dataset
(imported via /v1/datasets/import) gets schema-derived examples instead and
is never told about e-commerce interpretations that don't exist for it.
"""
import re

from app.datasets import BASE_TABLES

FEW_SHOT_EXAMPLES = [
    {
        "question": "How many customers signed up in 2025?",
        "sql": "SELECT COUNT(*) AS customer_count FROM customers WHERE signup_date >= '2025-01-01' AND signup_date < '2026-01-01';",
    },
    {
        "question": "What are the top 5 best-selling products by quantity?",
        "sql": (
            "SELECT p.product_name, SUM(oi.quantity) AS total_quantity "
            "FROM order_items oi JOIN products p ON oi.product_id = p.product_id "
            "GROUP BY p.product_name ORDER BY total_quantity DESC LIMIT 5;"
        ),
    },
    {
        "question": "What is the average rating per product category?",
        "sql": (
            "SELECT c.category_name, AVG(r.rating) AS avg_rating "
            "FROM reviews r "
            "JOIN products p ON r.product_id = p.product_id "
            "JOIN categories c ON p.category_id = c.category_id "
            "GROUP BY c.category_name ORDER BY avg_rating DESC;"
        ),
    },
    {
        "question": "List customers from Germany who placed an order in the last 90 days.",
        "sql": (
            "SELECT DISTINCT cu.customer_id, cu.first_name, cu.last_name "
            "FROM customers cu JOIN orders o ON cu.customer_id = o.customer_id "
            "WHERE cu.country = 'DE' AND o.order_date >= CURRENT_DATE - INTERVAL '90 days';"
        ),
    },
    {
        "question": "What is the net revenue by month for delivered orders?",
        "sql": (
            "SELECT DATE_TRUNC('month', o.order_date) AS month, "
            "SUM(oi.quantity * oi.unit_price - oi.discount) AS net_revenue "
            "FROM orders o JOIN order_items oi ON o.order_id = oi.order_id "
            "WHERE o.status = 'delivered' "
            "GROUP BY 1 ORDER BY 1;"
        ),
    },
]

AMBIGUOUS_TERMS = {
    "revenue": [
        {
            "label": "gross_revenue",
            "description": "Total sales before discounts: SUM(quantity * unit_price)",
            "example_sql": "SELECT SUM(quantity * unit_price) AS gross_revenue FROM order_items;",
        },
        {
            "label": "net_revenue",
            "description": "Sales after line-item discounts: SUM(quantity * unit_price - discount)",
            "example_sql": "SELECT SUM(quantity * unit_price - discount) AS net_revenue FROM order_items;",
        },
    ],
    "sales": [
        {
            "label": "order_count",
            "description": "Number of orders placed",
            "example_sql": "SELECT COUNT(*) AS order_count FROM orders;",
        },
        {
            "label": "gross_revenue",
            "description": "Total dollar amount sold: SUM(quantity * unit_price)",
            "example_sql": "SELECT SUM(quantity * unit_price) AS gross_revenue FROM order_items;",
        },
    ],
}


def _format_schema_block(schema: dict) -> str:
    lines = []
    for name, info in schema.items():
        lines.append(f"TABLE {name}" + (f" -- {info.description}" if info.description else ""))
        for col in info.columns:
            flags = []
            if col.is_primary_key:
                flags.append("PK")
            if col.sample_values:
                flags.append(f"e.g. {col.sample_values}")
            suffix = f"  ({', '.join(flags)})" if flags else ""
            lines.append(f"  - {col.name}: {col.type}{suffix}")
        for fk in info.foreign_keys:
            lines.append(f"  FK: {fk.column} -> {fk.ref_table}.{fk.ref_column}")
        lines.append("")
    return "\n".join(lines)


def _format_few_shot(examples: list) -> str:
    blocks = []
    for ex in examples:
        blocks.append(f"Q: {ex['question']}\nSQL: {ex['sql']}")
    return "\n\n".join(blocks)


def _synthesize_generic_examples(schema: dict, limit: int = 2) -> list:
    """Fallback few-shot examples for schemas that aren't the seeded
    e-commerce domain (e.g. an imported dataset) — built from the real
    table names actually present so the prompt never claims something false."""
    examples = []
    for name in list(schema.keys())[:limit]:
        examples.append({
            "question": f"How many rows are in {name}?",
            "sql": f"SELECT COUNT(*) AS row_count FROM {name};",
        })
        examples.append({
            "question": f"Show me the first 10 rows of {name}.",
            "sql": f"SELECT * FROM {name} LIMIT 10;",
        })
    return examples


def _few_shot_block(schema: dict) -> tuple[str, str]:
    """Returns (label, formatted_examples). Uses the curated e-commerce
    examples only when the schema actually contains e-commerce tables;
    otherwise synthesizes examples from whatever tables are really there."""
    if set(schema.keys()) & BASE_TABLES:
        return "EXAMPLES FOR THIS SCHEMA", _format_few_shot(FEW_SHOT_EXAMPLES)
    return "EXAMPLE QUERY PATTERNS (schema-derived)", _format_few_shot(_synthesize_generic_examples(schema))


SYSTEM_PROMPT = """You are SafeSQL, an expert SQL analyst. You translate natural-language \
business questions into a single read-only SQL SELECT statement against the given schema.

Rules:
- Only ever produce SELECT statements. Never write INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE.
- Use only the tables and columns given in the schema below. Do not invent columns.
- Prefer explicit JOIN ... ON clauses using the given foreign keys.
- If the question is ambiguous (a term could reasonably mean more than one thing, e.g. \
"revenue" as gross vs net), do NOT guess: report that clarification is needed instead of \
generating SQL.
- If the question cannot be answered with the given schema (asks about data that doesn't \
exist here), say so plainly rather than inventing a query.
- Always add a reasonable LIMIT for exploratory row-level queries unless the question is \
clearly an aggregate.
"""


def build_generation_prompt(
    question: str,
    schema: dict,
    variant: str = "primary",
    error_context: dict | None = None,
    prior_sql: str | None = None,
) -> str:
    schema_block = _format_schema_block(schema)
    few_shot_label, few_shot = _few_shot_block(schema)
    variant_hint = ""
    if variant == "alternate":
        variant_hint = (
            "\nIMPORTANT: Produce an INDEPENDENT alternative query strategy from the most "
            "obvious one - e.g. use a different join order, a subquery/CTE instead of a "
            "direct join, or a different aggregation path - while still correctly answering "
            "the question. This is used to cross-check correctness against a first attempt.\n"
        )

    context_block = ""
    if error_context:
        context_block = f"""
PREVIOUS ATTEMPT FAILED - fix the specific problem below, don't start over from scratch:
Previous SQL: {error_context['previous_sql']}
Database error: {error_context['error']}
Produce a corrected query that avoids this exact error.
"""
    elif prior_sql:
        context_block = f"""
This is a FOLLOW-UP to a previous query. The user's previous SQL was:
{prior_sql}
Adjust that query to satisfy the new instruction below, reusing its structure where it still
applies rather than starting over.
"""

    return f"""{SYSTEM_PROMPT}

SCHEMA:
{schema_block}

{few_shot_label}:
{few_shot}
{variant_hint}{context_block}
QUESTION: {question}

Respond using the generate_sql tool."""


def build_back_translation_prompt(sql: str) -> str:
    return f"""Here is a SQL query:

{sql}

In one sentence, state precisely what business question this SQL query answers. \
Be specific about filters, grouping, and aggregation - don't just restate the table names."""


def build_explain_prompt(sql: str, schema: dict) -> str:
    schema_block = _format_schema_block(schema)
    return f"""You are explaining a SQL query to a non-technical business stakeholder.

SCHEMA:
{schema_block}

SQL QUERY:
{sql}

Write a clear, structured explanation in 3-5 sentences covering: which tables it reads from and
how they're joined, what filters are applied, what aggregation or grouping happens (if any), and
how the results are sorted or limited. Plain English, no SQL jargon like "GROUP BY" - describe
what it means for the business question instead."""


QUALIFIERS = ("net", "gross")


def build_ambiguity_check(question: str, schema: dict) -> str | None:
    """Only flags ambiguity for terms whose interpretations are grounded in
    the seeded e-commerce schema (order_items-based gross/net revenue etc).
    Against an unrelated imported dataset, those interpretations don't exist,
    so the check is skipped entirely rather than offering a nonsensical
    clarification."""
    if not (set(schema.keys()) & BASE_TABLES):
        return None

    q_lower = question.lower()
    for term, interpretations in AMBIGUOUS_TERMS.items():
        if term not in q_lower:
            continue
        # Already disambiguated in the question itself (e.g. "net revenue").
        pattern = r"\b(" + "|".join(QUALIFIERS) + r")\s+" + re.escape(term) + r"\b"
        if re.search(pattern, q_lower):
            continue
        return term
    return None
