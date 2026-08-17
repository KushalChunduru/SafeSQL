# SafeSQL — Text-to-SQL with Guardrails and Hallucination Detection

A natural-language interface to a real SQL database that a compliance team could actually approve:
generated SQL is safety-checked before it ever reaches the database, execution happens read-only
in a sandboxed transaction, and every answer ships with a confidence score built from independent
correctness signals rather than the model's own self-report.

## Headline numbers (smoke-test run, `LLM_PROVIDER=mock`)

> These numbers come from the deterministic **mock** LLM provider (no API key, zero cost) — it only
> exists to exercise the full pipeline end-to-end in CI/dev. It is **not** a text-to-SQL model, so
> SQL-exact/execution-match numbers below are a floor, not a ceiling. Run `python eval/run_eval.py`
> with `LLM_PROVIDER=openai` or `anthropic` and a real key for representative accuracy — see
> [Evaluation](#evaluation).

- **Guardrail effectiveness: 8/8 (100%)** dangerous queries blocked — **zero unsafe queries executed** across the adversarial test set (DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE, stacked statements, over-deep subqueries).
- **Ambiguity detection: 4/4 (100%)** — underspecified terms like "revenue" correctly trigger a clarification request instead of a guessed answer.
- Full breakdown: [`eval/eval_report.md`](eval/eval_report.md).

**Lead with safety, not accuracy** — a wrong-but-cautious answer is recoverable; an unsafe query that mutates data is not.

## Architecture

```
Question ─▶ ambiguity check ─▶ schema-aware prompt ─▶ LLM (structured output)
                                                            │
                                                            ▼
                                                     guardrail middleware
                                              (blocks DDL/DML, limits rows,
                                               caps subquery depth, EXPLAIN check)
                                                            │
                                                            ▼
                                          sandboxed read-only execution
                                        (SELECT-only DB role + rolled-back txn)
                                                            │
                              ┌─────────────────────────────┼─────────────────────────────┐
                              ▼                              ▼                              ▼
                    back-translation                  result sanity                 independent
                    alignment scoring                    checks                    2nd-query check
                              └─────────────────────────────┼─────────────────────────────┘
                                                            ▼
                                                  combined confidence score
                                                            │
                                                            ▼
                                                  API response + Streamlit UI
```

## Domain

An e-commerce analytics schema: `customers`, `categories`, `products`, `orders`, `order_items`,
`reviews`. Seeded deterministically with Faker (~500 customers, 200 products, 2,000 orders, ~6,000
order line items, 1,500 reviews). `revenue` is deliberately ambiguous (gross vs. net) to exercise
the clarification flow.

## Safety layers (defense in depth)

1. **Prompt-level**: the system prompt forbids anything but `SELECT`.
2. **Guardrail middleware** (`app/guardrails.py`, `sqlparse`-based, every rule independently
   configurable via `.env`): blocks all DDL (`CREATE`/`ALTER`/`DROP`/`TRUNCATE`) and DML writes
   (`INSERT`/`UPDATE`/`DELETE`), rejects multi-statement/stacked SQL, auto-injects `LIMIT 1000`
   when missing, rejects subqueries nested past a configurable depth, and (when `EXPLAIN` gives a
   numeric row estimate) blocks queries estimated to scan an excessive number of rows. Every block
   is logged with the reason, timestamp, question, and rejected SQL (`app.guardrails.AUDIT_LOG`).
3. **Sandboxed execution** (`app/sql_executor.py`): runs inside a transaction that is always rolled
   back, and connects through a dedicated **read-only database role** — on Postgres, `safesql_reader`
   has `SELECT`-only grants (see `data/postgres_init.sql`); on DuckDB, the file is opened in
   `read_only` mode. Even a write statement that somehow slipped past guardrail #2 cannot succeed
   at the database layer.

## Hallucination detection

- **Back-translation**: the LLM restates, in its own words, what question its generated SQL
  answers; that restatement is scored (token-set similarity) against the original question. Low
  alignment flags a likely mismatch.
- **Result sanity checks**: NULL-heavy result columns (bad JOIN signal), negative values in
  sum/count-style columns, out-of-range ratings, empty results.
- **Multi-query agreement**: a second, independently-prompted SQL query (different join/aggregation
  strategy) is generated and executed; agreement between the two is a strong correctness signal,
  disagreement surfaces both queries side by side.
- **Confidence score** (`app/confidence.py`): a weighted combination of syntax validity,
  back-translation alignment, sanity-check pass rate, multi-query agreement, and a schema-coverage
  heuristic (does the query's structure — joins, aggregates, date filters — match what the
  question's phrasing implies?). Shown prominently, broken down by component, next to every result.

## Ambiguity handling

Terms with more than one reasonable SQL meaning (e.g. "revenue" = gross vs. net) are caught before
generation and returned as a structured clarification request with example SQL for each
interpretation — rather than the system silently picking one. A question that already disambiguates
itself ("net revenue") is *not* flagged. See `app/prompts.py::AMBIGUOUS_TERMS` /
`build_ambiguity_check`.

## Project layout

```
app/
  config.py             settings (env-driven)
  db.py                 SQLAlchemy engine factory (duckdb today, postgres-ready; separate read-only reader engine)
  schema_introspect.py  SQLAlchemy Inspector -> structured schema + sample values
  schema_filter.py      relevance filtering so only likely-needed tables go in the prompt
  prompts.py            dynamic prompt constructor + few-shot bank + ambiguity glossary
  llm_client.py         provider-agnostic client: mock | openai (gpt-4o-mini) | anthropic (claude)
  models.py             pydantic request/response schemas
  guardrails.py          safety middleware + audit log
  sql_executor.py        sandboxed read-only execution
  validation.py           hallucination-detection signals
  confidence.py           combined confidence score
  history.py               session history + feedback store
  main.py                   FastAPI app
frontend/streamlit_app.py    UI: NL input, editable SQL, results table, confidence breakdown, history, feedback
eval/golden_queries.json     42 NL questions (simple/join/aggregate/date-filter/ambiguous/unanswerable) + 8 adversarial SQL cases
eval/run_eval.py              computes eval numbers, writes eval/eval_report.md
data/schema.sql, seed.py       DDL + deterministic Faker seeding
data/postgres_init.sql          creates the read-only Postgres role (Postgres path only)
docker-compose.yml, Dockerfile  Postgres + API + frontend orchestration (opt-in, see below)
```

## Setup

### Option A — DuckDB, no Docker (fastest way to try it today)

```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env
python data/seed.py
uvicorn app.main:app --reload
```

In another terminal:

```bash
streamlit run frontend/streamlit_app.py
```

By default `.env` has `LLM_PROVIDER=mock`, so the whole pipeline (guardrails, sandboxing,
hallucination checks, confidence scoring, UI) runs with zero API cost. To use a real model, set in
`.env`:

```
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini      # cheapest capable option
```

or

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

or, for **$0 cost** (Gemini's free tier, rate-limited but no billing required — grab a key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey)):

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash
```

### Option B — PostgreSQL via Docker Compose (production-shaped path)

```bash
docker compose up --build
```

This starts Postgres, seeds it (one-off `seed` service), then starts the API (`:8000`) and Streamlit
UI (`:8501`). Set `LLM_PROVIDER`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY` as environment variables before
running, or in a `.env` file next to `docker-compose.yml` (Compose reads it automatically). Switching
from Option A requires no code changes — only `DB_BACKEND=postgres` plus connection settings, since
everything goes through the same SQLAlchemy engine abstraction (`app/db.py`).

## API

- `POST /v1/query {question, session_id?, force_interpretation?}` → SQL, explanation, results,
  confidence breakdown, guardrail warnings, or a clarification request.
- `GET /v1/schema` → introspected schema (tables, columns, types, FKs, sample values).
- `GET /v1/history?session_id=` → past queries for a session.
- `POST /v1/feedback {query_id, correct, notes}` → records correctness feedback (the flywheel: wrong
  answers become eval regressions, correct ones become candidate few-shot examples).

## Evaluation

```bash
python eval/run_eval.py
```

Reports, over 42 golden NL questions (simple lookups, multi-table JOINs, GROUP BY aggregations,
date-range filters, deliberately ambiguous phrasing, and out-of-schema/unanswerable questions) plus
8 adversarial SQL cases run directly through the guardrail layer:

- SQL exact match & execution-result match against golden queries
- Ambiguity-detection rate (did it ask instead of guess?)
- Unanswerable-question hallucination avoidance
- Guardrail block rate (dangerous queries stopped before reaching the database)

Full current output: [`eval/eval_report.md`](eval/eval_report.md).
