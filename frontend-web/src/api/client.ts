import type { AuditEntry, HistoryItem, QueryResponse, SchemaDict } from "../types";

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
  audit: (limit = 50) => request<AuditEntry[]>(`/v1/audit?limit=${limit}`),
  history: (sessionId: string) =>
    request<HistoryItem[]>(`/v1/history?session_id=${encodeURIComponent(sessionId)}`),
  feedback: (queryId: string, correct: boolean, notes = "") =>
    request<{ status: string }>("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ query_id: queryId, correct, notes }),
    }),
};
