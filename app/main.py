import csv
import io
import logging

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app import history
from app.config import get_settings
from app.datasets import DatasetImportError, delete_dataset, import_dataset, list_datasets
from app.db import get_reader_engine
from app.guardrails import AUDIT_LOG, apply_guardrails
from app.llm_client import get_llm_client
from app.models import (
    DatasetImportResponse, DatasetInfo, ExplainRequest, ExplainResponse, FavoriteRequest,
    FeedbackRequest, ProviderInfo, QueryRequest, QueryResponse, RefineRequest,
)
from app.pipeline import execute_query
from app.schema_filter import build_filtered_schema
from app.schema_introspect import get_schema, schema_to_dict
from app.sql_executor import execute_readonly

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
    return execute_query(
        req.question,
        req.session_id,
        allow_clarification=req.allow_clarification,
        force_interpretation=req.force_interpretation,
    )


@app.post("/v1/query/refine", response_model=QueryResponse)
def refine_query(req: RefineRequest):
    prior = history.get_entry(req.query_id)
    if not prior or not prior.get("sql"):
        raise HTTPException(status_code=404, detail="query_id not found or has no SQL to refine")
    effective_question = f"{prior['question']} — follow-up: {req.refinement}"
    return execute_query(effective_question, req.session_id, prior_sql=prior["sql"])


@app.post("/v1/explain", response_model=ExplainResponse)
def explain_sql_endpoint(req: ExplainRequest):
    engine = get_reader_engine()
    guard = apply_guardrails(req.sql, "", engine=None)
    if not guard.allowed:
        raise HTTPException(status_code=400, detail="Only read-only SELECT/WITH statements can be explained")
    schema = get_schema(engine)
    filtered_schema = build_filtered_schema(req.sql, schema, top_k=len(schema))
    llm = get_llm_client()
    explanation = llm.explain_sql(req.sql, filtered_schema)
    return ExplainResponse(sql=req.sql, explanation=explanation)


@app.get("/v1/audit")
def get_audit_log(limit: int = 50):
    """Recent guardrail activity (blocks + warnings), most recent first — the
    audit trail backing the Safety Dashboard's live feed."""
    return list(reversed(AUDIT_LOG[-limit:]))


@app.get("/v1/history")
def get_history_endpoint(session_id: str | None = None, limit: int = 50, favorites_only: bool = False):
    return history.get_history(session_id=session_id, limit=limit, favorites_only=favorites_only)


@app.post("/v1/feedback")
def submit_feedback(req: FeedbackRequest):
    ok = history.add_feedback(req.query_id, req.correct, req.notes)
    if not ok:
        raise HTTPException(status_code=404, detail="query_id not found")
    return {"status": "recorded"}


@app.post("/v1/history/{query_id}/favorite")
def set_favorite_endpoint(query_id: str, req: FavoriteRequest):
    ok = history.set_favorite(query_id, req.favorite)
    if not ok:
        raise HTTPException(status_code=404, detail="query_id not found")
    return {"status": "recorded"}


@app.get("/v1/query/{query_id}/export")
def export_query(query_id: str, format: str = "csv"):
    entry = history.get_entry(query_id)
    if not entry or not entry.get("sql"):
        raise HTTPException(status_code=404, detail="query_id not found or has no SQL to export")

    s = get_settings()
    engine = get_reader_engine()
    result = execute_readonly(engine, entry["sql"], row_cap=s.max_row_limit)
    if result.error:
        raise HTTPException(status_code=422, detail=f"Query could not be re-executed for export: {result.error}")

    if format == "json":
        payload = [dict(zip(result.columns, row)) for row in result.rows]
        return payload

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(result.columns)
    writer.writerows(result.rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{query_id[:8]}.csv"'},
    )


@app.post("/v1/datasets/import", response_model=DatasetImportResponse)
async def import_dataset_endpoint(file: UploadFile = File(...), table_name: str | None = Form(None)):
    content = await file.read()
    try:
        return import_dataset(content, file.filename or "dataset.csv", table_name)
    except DatasetImportError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/v1/datasets", response_model=list[DatasetInfo])
def list_datasets_endpoint():
    return list_datasets()


@app.delete("/v1/datasets/{table_name}")
def delete_dataset_endpoint(table_name: str):
    try:
        delete_dataset(table_name)
    except DatasetImportError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "deleted"}


@app.get("/v1/providers", response_model=ProviderInfo)
def get_providers():
    s = get_settings()
    model_by_provider = {
        "mock": "n/a",
        "openai": s.openai_model,
        "anthropic": s.anthropic_model,
        "gemini": s.gemini_model,
    }
    return ProviderInfo(
        active_provider=s.llm_provider,
        active_model=model_by_provider.get(s.llm_provider, "n/a"),
        available_providers=["mock", "openai", "anthropic", "gemini"],
        configured={
            "openai": bool(s.openai_api_key),
            "anthropic": bool(s.anthropic_api_key),
            "gemini": bool(s.gemini_api_key),
        },
    )
