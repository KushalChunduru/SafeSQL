from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------- LLM structured output ----------

class SQLGeneration(BaseModel):
    sql: str = Field(description="The SQL SELECT query that answers the question.")
    explanation: str = Field(description="Plain-English explanation of what the query does.")
    confidence_self_report: float = Field(ge=0, le=1, description="Model's own confidence in this SQL, 0-1.")
    tables_used: list[str] = Field(default_factory=list)
    columns_used: list[str] = Field(default_factory=list)


class Interpretation(BaseModel):
    label: str
    description: str
    example_sql: str


class ClarificationNeeded(BaseModel):
    needs_clarification: Literal[True] = True
    ambiguous_term: str
    interpretations: list[Interpretation]


class BackTranslation(BaseModel):
    reconstructed_question: str
    alignment_score: float = Field(ge=0, le=1)
    reasoning: str


# ---------- Guardrails ----------

class GuardrailViolation(BaseModel):
    rule: str
    reason: str
    severity: Literal["blocked", "warning"] = "blocked"


# ---------- Confidence ----------

class ConfidenceBreakdown(BaseModel):
    syntax_valid: bool
    back_translation_alignment: float
    sanity_check_pass_rate: float
    multi_query_agreement: Optional[float] = None
    schema_coverage_score: float
    overall: float


class SanityFlag(BaseModel):
    check: str
    message: str


# ---------- API request/response ----------

class QueryRequest(BaseModel):
    question: str
    session_id: str = "default"
    allow_clarification: bool = True
    force_interpretation: Optional[str] = None  # index into a prior clarification's interpretations


class QueryResponse(BaseModel):
    status: Literal["ok", "needs_clarification", "blocked", "error"]
    question: str
    sql: Optional[str] = None
    explanation: Optional[str] = None
    columns: list[str] = Field(default_factory=list)
    rows: list[list] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False
    execution_time_ms: Optional[float] = None
    confidence: Optional[ConfidenceBreakdown] = None
    sanity_flags: list[SanityFlag] = Field(default_factory=list)
    guardrail_warnings: list[GuardrailViolation] = Field(default_factory=list)
    clarification: Optional[ClarificationNeeded] = None
    alternate_sql: Optional[str] = None
    alternate_agreement: Optional[bool] = None
    error: Optional[str] = None
    query_id: Optional[str] = None


class FeedbackRequest(BaseModel):
    query_id: str
    correct: bool
    notes: str = ""


class HistoryItem(BaseModel):
    query_id: str
    session_id: str
    question: str
    sql: Optional[str]
    status: str
    confidence_overall: Optional[float]
    feedback: Optional[bool] = None
    timestamp: str
