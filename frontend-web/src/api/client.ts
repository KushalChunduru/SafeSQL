import type {
  AuditEntry, DatasetImportResponse, DatasetInfo, ExplainResponse, HistoryItem, ProviderInfo,
  QueryResponse, SchemaDict,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface RunQueryPayload {
  question: string;
  session_id: string;
  allow_clarification?: boolean;
  force_interpretation?: string;
}

export const api = {
  base: API_BASE,
  health: () => request<{ status: string }>("/v1/health"),
  schema: () => request<SchemaDict>("/v1/schema"),
  runQuery: (payload: RunQueryPayload) =>
    request<QueryResponse>("/v1/query", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  refineQuery: (queryId: string, refinement: string, sessionId: string) =>
    request<QueryResponse>("/v1/query/refine", {
      method: "POST",
      body: JSON.stringify({ query_id: queryId, refinement, session_id: sessionId }),
    }),
  explainSql: (sql: string) =>
    request<ExplainResponse>("/v1/explain", {
      method: "POST",
      body: JSON.stringify({ sql }),
    }),
  audit: (limit = 50) => request<AuditEntry[]>(`/v1/audit?limit=${limit}`),
  history: (sessionId: string, favoritesOnly = false) =>
    request<HistoryItem[]>(
      `/v1/history?session_id=${encodeURIComponent(sessionId)}&favorites_only=${favoritesOnly}`
    ),
  feedback: (queryId: string, correct: boolean, notes = "") =>
    request<{ status: string }>("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ query_id: queryId, correct, notes }),
    }),
  setFavorite: (queryId: string, favorite: boolean) =>
    request<{ status: string }>(`/v1/history/${queryId}/favorite`, {
      method: "POST",
      body: JSON.stringify({ favorite }),
    }),
  exportUrl: (queryId: string, format: "csv" | "json" = "csv") =>
    `${API_BASE}/v1/query/${queryId}/export?format=${format}`,
  importDataset: (file: File, tableName?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (tableName) form.append("table_name", tableName);
    return requestForm<DatasetImportResponse>("/v1/datasets/import", form);
  },
  listDatasets: () => request<DatasetInfo[]>("/v1/datasets"),
  deleteDataset: (tableName: string) =>
    request<{ status: string }>(`/v1/datasets/${encodeURIComponent(tableName)}`, { method: "DELETE" }),
  providers: () => request<ProviderInfo>("/v1/providers"),
};
