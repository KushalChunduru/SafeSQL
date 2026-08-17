"""In-process query history + feedback store.

Kept simple (a module-level list) since this is a single-process demo
service; swapping for a real table is a drop-in change behind this module's
functions if the service needs to scale out.
"""
import uuid
from datetime import datetime, timezone

from app.models import HistoryItem, QueryResponse

_STORE: dict[str, dict] = {}


def record(session_id: str, question: str, response: QueryResponse) -> str:
    query_id = str(uuid.uuid4())
    response.query_id = query_id
    _STORE[query_id] = {
        "query_id": query_id,
        "session_id": session_id,
        "question": question,
        "sql": response.sql,
        "status": response.status,
        "confidence_overall": response.confidence.overall if response.confidence else None,
        "feedback": None,
        "notes": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return query_id


def add_feedback(query_id: str, correct: bool, notes: str = "") -> bool:
    if query_id not in _STORE:
        return False
    _STORE[query_id]["feedback"] = correct
    _STORE[query_id]["notes"] = notes
    return True


def get_history(session_id: str | None = None, limit: int = 50) -> list:
    items = list(_STORE.values())
    if session_id:
        items = [i for i in items if i["session_id"] == session_id]
    items.sort(key=lambda i: i["timestamp"], reverse=True)
    return [HistoryItem(**{k: v for k, v in i.items() if k != "notes"}) for i in items[:limit]]


def get_positive_feedback_examples() -> list:
    """Correct, user-confirmed (question, sql) pairs — candidate few-shot
    examples for the prompt flywheel described in the project spec."""
    return [
        {"question": i["question"], "sql": i["sql"]}
        for i in _STORE.values()
        if i["feedback"] is True and i["sql"]
    ]
