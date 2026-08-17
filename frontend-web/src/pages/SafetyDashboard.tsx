import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ShieldCheck, RefreshCw, AlertTriangle, ShieldAlert, Loader2, Radio } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { api } from "../api/client";
import type { AuditEntry } from "../types";

// Snapshot from eval/eval_report.md — regenerate via `python eval/run_eval.py`.
// Numbers below reflect the LLM_PROVIDER=mock smoke-test run; re-run with a
// real model configured for representative accuracy figures.
const EVAL_SNAPSHOT = [
  { metric: "Guardrail effectiveness", pct: 100, fraction: "8/8", tone: "#0f9d58" },
  { metric: "Ambiguity detection", pct: 100, fraction: "4/4", tone: "#2b52ff" },
  { metric: "Execution accuracy", pct: 17.6, fraction: "6/34", tone: "#7c3aed" },
  { metric: "SQL exact match", pct: 2.9, fraction: "1/34", tone: "#d97706" },
  { metric: "Unanswerable avoidance", pct: 0, fraction: "0/4", tone: "#e11d3f" },
];

const HEADLINE = [
  { label: "Dangerous queries blocked", value: "8 / 8", tone: "mint" as const },
  { label: "Unsafe queries ever executed", value: "0", tone: "mint" as const },
  { label: "Golden eval cases", value: "42", tone: "cyan" as const },
  { label: "Adversarial SQL cases", value: "8", tone: "violet" as const },
];

function timeAgo(unixSeconds: number) {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export default function SafetyDashboard() {
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAudit() {
    setLoading(true);
    setError(null);
    try {
      setAudit(await api.audit(30));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Badge tone="mint">
          <ShieldCheck size={12} /> Safety Dashboard
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">
          Lead with safety, not accuracy
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          A live view of the guardrail audit log, plus the current numbers from{" "}
          <code className="font-mono text-xs">eval/eval_report.md</code>.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {HEADLINE.map((h, i) => (
            <motion.div key={h.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="text-center">
                <div className="font-display text-2xl font-bold text-slate-950">{h.value}</div>
                <div className="mt-1 text-[11px] text-slate-500">{h.label}</div>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card className="min-w-0">
            <span className="text-xs uppercase tracking-wide text-slate-500">Eval suite snapshot</span>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={EVAL_SNAPSHOT} layout="vertical" margin={{ left: 8, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4ddc9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "#52525e", fontSize: 11 }} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="metric"
                    width={150}
                    tick={{ fill: "#15151a", fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(14,14,16,0.05)" }}
                    contentStyle={{ background: "#0e0e10", border: "2px solid #0e0e10", borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: "#f4f2ea", fontWeight: 700 }}
                    formatter={(_value, _name, item) => [`${item.payload.fraction} (${item.payload.pct}%)`, "result"]}
                  />
                  <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                    {EVAL_SNAPSHOT.map((d) => (
                      <Cell key={d.metric} fill={d.tone} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs italic text-slate-500">
              Accuracy figures are from the zero-cost mock provider used for smoke testing — configure
              a real model (OpenAI, Anthropic, or Gemini's free tier) and re-run{" "}
              <code className="font-mono">python eval/run_eval.py</code> for representative numbers.
              Safety figures (guardrail effectiveness, ambiguity detection) are provider-independent.
            </p>
          </Card>

          <Card className="min-w-0">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Radio size={13} className="text-mint animate-pulse-slow" /> Live guardrail activity
              </span>
              <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={loadAudit}>
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>

            {error && (
              <p className="mt-4 text-sm text-rose">{error}</p>
            )}

            {!audit && !error && (
              <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            )}

            {audit && audit.length === 0 && (
              <p className="mt-6 text-sm text-slate-500">
                No guardrail events yet this run.{" "}
                <a href="/workspace" className="text-cyan-glow hover:underline">
                  Ask a question
                </a>{" "}
                in the workspace — even a normal query without a LIMIT logs an event here.
              </p>
            )}

            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {audit?.map((entry, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 text-xs ${entry.severity === "blocked" ? "border-rose/30 bg-rose/5" : "border-amber/25 bg-amber/5"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-1.5 font-mono font-semibold ${entry.severity === "blocked" ? "text-rose" : "text-amber"}`}>
                      {entry.severity === "blocked" ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                      {entry.rule}
                    </span>
                    <span className="text-slate-400">{timeAgo(entry.timestamp)}</span>
                  </div>
                  <p className="mt-1 text-slate-600">{entry.reason}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{entry.question}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
