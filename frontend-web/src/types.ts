export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  sample_values: (string | number)[];
}

export interface ForeignKeyInfo {
  column: string;
  references: string; // "table.column"
}

export interface TableInfo {
  description: string;
  columns: ColumnInfo[];
  foreign_keys: ForeignKeyInfo[];
}

export type SchemaDict = Record<string, TableInfo>;

export interface Interpretation {
  label: string;
  description: string;
  example_sql: string;
}

export interface ClarificationNeeded {
  needs_clarification: true;
  ambiguous_term: string;
  interpretations: Interpretation[];
}

export interface GuardrailViolation {
  rule: string;
  reason: string;
  severity: "blocked" | "warning";
}

export interface SanityFlag {
  check: string;
  message: string;
}

export interface ConfidenceBreakdown {
  syntax_valid: boolean;
  back_translation_alignment: number;
  sanity_check_pass_rate: number;
  multi_query_agreement: number | null;
  schema_coverage_score: number;
  overall: number;
}

export type QueryStatus = "ok" | "needs_clarification" | "blocked" | "error";

export interface QueryResponse {
  status: QueryStatus;
  question: string;
  sql: string | null;
  explanation: string | null;
  columns: string[];
  rows: (string | number | boolean | null)[][];
  row_count: number;
  truncated: boolean;
  execution_time_ms: number | null;
  confidence: ConfidenceBreakdown | null;
  sanity_flags: SanityFlag[];
  guardrail_warnings: GuardrailViolation[];
  clarification: ClarificationNeeded | null;
  alternate_sql: string | null;
  alternate_agreement: boolean | null;
  error: string | null;
  query_id: string | null;
}

export interface AuditEntry {
  timestamp: number; // unix seconds
  question: string;
  sql: string;
  rule: string;
  reason: string;
  severity: "blocked" | "warning";
}

export interface HistoryItem {
  query_id: string;
  session_id: string;
  question: string;
  sql: string | null;
  status: string;
  confidence_overall: number | null;
  feedback: boolean | null;
  timestamp: string;
}
