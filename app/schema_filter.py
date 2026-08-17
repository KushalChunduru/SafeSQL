"""Relevance filtering: pick the subset of tables worth putting in the prompt.

Default: lightweight token-overlap scoring (rapidfuzz) — zero external deps,
works with no API key. If an OpenAI key is configured, `embed_and_filter`
can be swapped in via the same interface (both return an ordered list of
table names above a relevance threshold).
"""
import re

from rapidfuzz import fuzz

from app.config import get_settings

STOPWORDS = {
    "the", "a", "an", "of", "for", "in", "on", "by", "to", "and", "or", "is", "are",
    "was", "were", "what", "which", "who", "how", "many", "much", "show", "me", "list",
    "get", "find", "give", "with", "per", "each", "total", "all", "top", "please",
}


def _tokenize(text: str) -> set:
    words = re.findall(r"[a-z0-9_]+", text.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 1}


def _table_text_blob(table_name: str, table_info) -> str:
    parts = [table_name, table_info.description]
    for col in table_info.columns:
        parts.append(col.name)
        parts.extend(str(v) for v in col.sample_values[:5])
    return " ".join(parts)


def filter_relevant_tables(question: str, schema: dict, top_k: int = 4, min_score: float = 15.0) -> list:
    """Returns table names sorted by relevance, always including FK-linked
    neighbors of any selected table so joins remain possible."""
    scored = []
    for name, info in schema.items():
        blob = _table_text_blob(name, info)
        score = fuzz.token_set_ratio(question.lower(), blob.lower())
        # boost exact table/column name mentions
        q_tokens = _tokenize(question)
        name_tokens = _tokenize(name) | {c.name.lower() for c in info.columns}
        if q_tokens & name_tokens:
            score += 25
        scored.append((name, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    selected = [n for n, s in scored[:top_k] if s >= min_score]
    if not selected:
        selected = [scored[0][0]] if scored else list(schema.keys())

    # pull in FK neighbors so joins implied by the question stay possible
    expanded = set(selected)
    for name in list(selected):
        info = schema[name]
        for fk in info.foreign_keys:
            expanded.add(fk.ref_table)
    for name, info in schema.items():
        for fk in info.foreign_keys:
            if fk.ref_table in expanded:
                expanded.add(name)

    # keep original relevance ordering, append neighbors after
    ordered = [n for n in [s[0] for s in scored] if n in expanded]
    return ordered


def build_filtered_schema(question: str, schema: dict, top_k: int = 4) -> dict:
    relevant = filter_relevant_tables(question, schema, top_k=top_k)
    return {name: schema[name] for name in relevant}
