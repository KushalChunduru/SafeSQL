"""Provider-agnostic LLM client.

LLM_PROVIDER=mock      -> deterministic, zero-cost, no API key required (smoke tests / CI / eval dry-runs)
LLM_PROVIDER=openai    -> gpt-4o-mini (or configured model) via function calling
LLM_PROVIDER=anthropic -> claude-sonnet-5 (or configured model) via tool use
LLM_PROVIDER=gemini    -> gemini-2.0-flash (or configured model) via function calling, free tier
                          (Google AI Studio, https://aistudio.google.com/apikey - no cost, rate-limited)

All providers implement the same three operations: generate_sql, back_translate, judge_alignment.
"""
import json
from abc import ABC, abstractmethod

from app.config import get_settings
from app.models import SQLGeneration
from app.prompts import build_back_translation_prompt, build_generation_prompt, FEW_SHOT_EXAMPLES

SQL_TOOL_SCHEMA = {
    "name": "generate_sql",
    "description": "Return the generated SQL and metadata about it.",
    "input_schema": {
        "type": "object",
        "properties": {
            "sql": {"type": "string", "description": "The SQL SELECT statement."},
            "explanation": {"type": "string"},
            "confidence_self_report": {"type": "number", "minimum": 0, "maximum": 1},
            "tables_used": {"type": "array", "items": {"type": "string"}},
            "columns_used": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["sql", "explanation", "confidence_self_report", "tables_used", "columns_used"],
    },
}


class LLMClient(ABC):
    @abstractmethod
    def generate_sql(self, question: str, schema: dict, variant: str = "primary") -> SQLGeneration: ...

    @abstractmethod
    def back_translate(self, sql: str) -> str: ...


class MockLLMClient(LLMClient):
    """Deterministic heuristic generator. Good enough to exercise the full
    pipeline (guardrails, validation, confidence, API, UI) without spending
    API credits. Matches few-shot examples on close phrasing, otherwise
    falls back to a simple single-table SELECT with a lower confidence."""

    def generate_sql(self, question: str, schema: dict, variant: str = "primary") -> SQLGeneration:
        q = question.lower().strip()
        for ex in FEW_SHOT_EXAMPLES:
            if _rough_match(q, ex["question"].lower()):
                sql = ex["sql"]
                if variant == "alternate":
                    sql = _wrap_as_cte(sql)
                return SQLGeneration(
                    sql=sql,
                    explanation=f"Matched a known pattern for: {ex['question']}",
                    confidence_self_report=0.9,
                    tables_used=_guess_tables(sql, schema),
                    columns_used=[],
                )

        table = next(iter(schema.keys())) if schema else "customers"
        sql = f"SELECT * FROM {table} LIMIT 50;"
        return SQLGeneration(
            sql=sql,
            explanation=f"Mock provider fallback: no strong pattern match, returning a sample from {table}.",
            confidence_self_report=0.35,
            tables_used=[table],
            columns_used=[],
        )

    def back_translate(self, sql: str) -> str:
        return f"This query retrieves data using: {sql[:120]}"


def _rough_match(a: str, b: str) -> bool:
    a_tokens = set(a.split())
    b_tokens = set(b.split())
    if not a_tokens or not b_tokens:
        return False
    overlap = len(a_tokens & b_tokens) / len(b_tokens)
    return overlap >= 0.5


def _wrap_as_cte(sql: str) -> str:
    inner = sql.rstrip(";")
    return f"WITH base AS ({inner}) SELECT * FROM base;"


def _guess_tables(sql: str, schema: dict) -> list:
    return [t for t in schema.keys() if t in sql]


class OpenAIClient(LLMClient):
    def __init__(self):
        from openai import OpenAI
        s = get_settings()
        self.client = OpenAI(api_key=s.openai_api_key)
        self.model = s.openai_model

    def generate_sql(self, question: str, schema: dict, variant: str = "primary") -> SQLGeneration:
        prompt = build_generation_prompt(question, schema, variant=variant)
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            tools=[{
                "type": "function",
                "function": {
                    "name": SQL_TOOL_SCHEMA["name"],
                    "description": SQL_TOOL_SCHEMA["description"],
                    "parameters": SQL_TOOL_SCHEMA["input_schema"],
                },
            }],
            tool_choice={"type": "function", "function": {"name": "generate_sql"}},
        )
        args = json.loads(resp.choices[0].message.tool_calls[0].function.arguments)
        return SQLGeneration(**args)

    def back_translate(self, sql: str) -> str:
        prompt = build_back_translation_prompt(sql)
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content.strip()


class AnthropicClient(LLMClient):
    def __init__(self):
        import anthropic
        s = get_settings()
        self.client = anthropic.Anthropic(api_key=s.anthropic_api_key)
        self.model = s.anthropic_model

    def generate_sql(self, question: str, schema: dict, variant: str = "primary") -> SQLGeneration:
        prompt = build_generation_prompt(question, schema, variant=variant)
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            tools=[SQL_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "generate_sql"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in resp.content:
            if block.type == "tool_use":
                return SQLGeneration(**block.input)
        raise RuntimeError("Anthropic response contained no tool_use block")

    def back_translate(self, sql: str) -> str:
        prompt = build_back_translation_prompt(sql)
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in resp.content if b.type == "text").strip()


def _proto_to_python(value):
    """Recursively unwrap google.ai.generativelanguage proto Map/Repeated
    composites into plain dict/list/scalars so pydantic can validate them."""
    if hasattr(value, "items"):
        return {k: _proto_to_python(v) for k, v in value.items()}
    if hasattr(value, "__iter__") and not isinstance(value, (str, bytes)):
        return [_proto_to_python(v) for v in value]
    return value


class GeminiClient(LLMClient):
    """Google Gemini via the free-tier AI Studio API key. Uses function
    calling with `mode=ANY` to force a structured `generate_sql` call."""

    def __init__(self):
        import google.generativeai as genai
        s = get_settings()
        genai.configure(api_key=s.gemini_api_key)
        # genai.protos.Schema.type is an enum (STRING/NUMBER/ARRAY/OBJECT/...),
        # not the lowercase JSON-Schema strings used by the OpenAI/Anthropic tool schema.
        gemini_schema = {
            "type": "OBJECT",
            "properties": {
                "sql": {"type": "STRING", "description": "The SQL SELECT statement."},
                "explanation": {"type": "STRING"},
                "confidence_self_report": {"type": "NUMBER"},
                "tables_used": {"type": "ARRAY", "items": {"type": "STRING"}},
                "columns_used": {"type": "ARRAY", "items": {"type": "STRING"}},
            },
            "required": ["sql", "explanation", "confidence_self_report", "tables_used", "columns_used"],
        }
        tool = genai.protos.Tool(function_declarations=[
            genai.protos.FunctionDeclaration(
                name="generate_sql",
                description=SQL_TOOL_SCHEMA["description"],
                parameters=gemini_schema,
            )
        ])
        self.model = genai.GenerativeModel(s.gemini_model, tools=[tool])

    def generate_sql(self, question: str, schema: dict, variant: str = "primary") -> SQLGeneration:
        prompt = build_generation_prompt(question, schema, variant=variant)
        resp = self.model.generate_content(
            prompt,
            tool_config={"function_calling_config": {"mode": "ANY", "allowed_function_names": ["generate_sql"]}},
        )
        for part in resp.candidates[0].content.parts:
            if part.function_call and part.function_call.name == "generate_sql":
                args = _proto_to_python(part.function_call.args)
                return SQLGeneration(**args)
        raise RuntimeError("Gemini response contained no generate_sql function call")

    def back_translate(self, sql: str) -> str:
        prompt = build_back_translation_prompt(sql)
        resp = self.model.generate_content(prompt, tool_config={"function_calling_config": {"mode": "NONE"}})
        return resp.text.strip()


_client_cache: dict = {}


def get_llm_client() -> LLMClient:
    s = get_settings()
    provider = s.llm_provider
    if provider in _client_cache:
        return _client_cache[provider]

    if provider == "openai":
        client = OpenAIClient()
    elif provider == "anthropic":
        client = AnthropicClient()
    elif provider == "gemini":
        client = GeminiClient()
    else:
        client = MockLLMClient()

    _client_cache[provider] = client
    return client
