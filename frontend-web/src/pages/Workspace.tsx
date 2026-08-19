import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Send, Loader2, ShieldAlert, AlertTriangle, CircleHelp, ThumbsUp, ThumbsDown,
  Clock, Rows3, Sparkles, GitCompareArrows, CheckCircle2, XCircle, Wrench, MessageSquareText,
  Star, Download, CornerDownRight,
} from "lucide-react";
import PageShell from "../components/layout/PageShell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import CodeBlock from "../components/ui/CodeBlock";
import ProgressBar from "../components/ui/ProgressBar";
import ConfidenceOrb from "../components/illustrations/ConfidenceOrb";
import EmptyState from "../components/illustrations/EmptyState";
import { api } from "../api/client";
import { getSessionId } from "../lib/session";
import type { QueryResponse } from "../types";

// Curated for the seeded e-commerce demo. Not a restriction — any free-text
// question works against whatever's actually in the database; these are just
// good starting points. If datasets have been imported, dynamically-generated
// suggestions for them are prepended below (see the useEffect in Workspace).
const BASE_EXAMPLES = [
  "What are the top 5 best-selling products by quantity?",
  "What is the net revenue by month for delivered orders?",
  "Which customers have never placed an order?",
  "What is the average rating per product category?",
  "How many orders were placed in the last 30 days?",
  "What is our total revenue this year?",
];

export default function Workspace() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<"up" | "down" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [refinement, setRefinement] = useState("");
  const [refining, setRefining] = useState(false);
  const [examples, setExamples] = useState<string[]>(BASE_EXAMPLES);
  const sessionId = getSessionId();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api
      .listDatasets()
      .then((datasets) => {
        if (datasets.length === 0) return;
        const dynamic = datasets.slice(0, 3).flatMap((d) => [
          `How many rows are in ${d.table_name}?`,
          `Show me the first 10 rows of ${d.table_name}.`,
        ]);
        setExamples([...dynamic, ...BASE_EXAMPLES]);
      })
      .catch(() => {
        /* fall back to the static examples */
      });
  }, []);

  function resetPerQueryState() {
    setFeedbackSent(null);
    setFavorited(false);
    setShowCorrections(false);
    setExplainText(null);
    setRefinement("");
  }

  async function ask(q: string, forceInterpretation?: string) {
    if (!q.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    resetPerQueryState();
    try {
      const resp = await api.runQuery({
        question: q,
        session_id: sessionId,
        force_interpretation: forceInterpretation,
      });
      setResponse(resp);
      if (!forceInterpretation) setQuestion(q);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Request failed. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  async function refine() {
    if (!response?.query_id || !refinement.trim()) return;
    setRefining(true);
    setErrorMsg(null);
    try {
      const resp = await api.refineQuery(response.query_id, refinement.trim(), sessionId);
      resetPerQueryState();
      setResponse(resp);
      setQuestion(resp.question);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Refinement failed.");
    } finally {
      setRefining(false);
    }
  }

  async function explain() {
    if (!response?.sql) return;
    setExplainLoading(true);
    try {
      const resp = await api.explainSql(response.sql);
      setExplainText(resp.explanation);
    } catch (e) {
      setExplainText(e instanceof Error ? `Explain failed: ${e.message}` : "Explain failed.");
    } finally {
      setExplainLoading(false);
    }
  }

  async function toggleFavorite() {
    if (!response?.query_id) return;
    const next = !favorited;
    setFavorited(next);
    try {
      await api.setFavorite(response.query_id, next);
    } catch {
      setFavorited(!next);
    }
  }

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuestion(q);
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendFeedback(correct: boolean) {
    if (!response?.query_id) return;
    setFeedbackSent(correct ? "up" : "down");
    try {
      await api.feedback(response.query_id, correct);
    } catch {
      /* best-effort */
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <Badge tone="cyan">
            <Sparkles size={12} /> Workspace
          </Badge>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">
            Ask the database anything
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Every query below runs through the full guardrail and hallucination-detection pipeline —
            nothing is fast-tracked, even the examples.
          </p>
        </div>

        <Card className="mb-6" glow>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(question)}
              placeholder="e.g. What are the top 5 best-selling products by quantity?"
              className="flex-1 rounded-xl border-2 border-ink-950 bg-paper px-4 py-3 text-sm text-slate-950 placeholder:text-slate-400 outline-none focus:bg-[var(--color-lime)]/10"
            />
            <Button onClick={() => ask(question)} disabled={loading || !question.trim()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Ask
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => ask(ex)}
                className="rounded-full border-2 border-ink-950 bg-paper px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-[var(--color-lime)] hover:text-ink-950"
              >
                {ex}
              </button>
            ))}
          </div>
        </Card>

        {errorMsg && (
          <Card className="mb-6 border-rose/30">
            <div className="flex items-center gap-2 text-rose">
              <XCircle size={18} />
              <span className="font-medium">{errorMsg}</span>
            </div>
          </Card>
        )}

        <>
          {loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="flex items-center gap-3 text-slate-600">
                <Loader2 size={18} className="animate-spin text-cyan-glow" />
                Generating SQL, running guardrails, cross-checking the result…
              </Card>
            </motion.div>
          )}

          {!loading && !response && !errorMsg && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="flex flex-col items-center gap-4 py-14 text-center">
                <EmptyState className="h-28 w-40 opacity-80" />
                <p className="max-w-sm text-sm text-slate-500">
                  Ask a question above or pick an example to see the full pipeline in action.
                </p>
              </Card>
            </motion.div>
          )}

          {!loading && response && response.status === "needs_clarification" && response.clarification && (
            <motion.div key="clarify" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card className="border-amber/30">
                <div className="flex items-center gap-2 text-amber">
                  <CircleHelp size={18} />
                  <span className="font-medium">
                    "{response.clarification.ambiguous_term}" is ambiguous — pick an interpretation
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {response.clarification.interpretations.map((interp) => (
                    <div key={interp.label} className="rounded-xl border-2 border-ink-950 bg-paper-100 p-4">
                      <div className="font-mono text-sm font-semibold text-cyan-glow">{interp.label}</div>
                      <p className="mt-1 text-xs text-slate-600">{interp.description}</p>
                      <CodeBlock code={interp.example_sql} className="mt-3 text-[11px]" />
                      <Button
                        variant="outline"
                        className="mt-3 w-full text-xs"
                        onClick={() => ask(response.question, interp.label)}
                      >
                        Use "{interp.label}"
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {!loading && response && response.status === "blocked" && (
            <motion.div key="blocked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card className="border-rose/30">
                <div className="flex items-center gap-2 text-rose">
                  <ShieldAlert size={18} />
                  <span className="font-medium">Blocked by guardrails</span>
                </div>
                {response.sql && <CodeBlock code={response.sql} className="mt-4" />}
                <div className="mt-4 space-y-2">
                  {response.guardrail_warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-rose/10 p-3 text-sm text-rose">
                      <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="font-mono font-semibold">{w.rule}</span> — {w.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {!loading && response && response.status === "error" && (
            <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card className="border-rose/30">
                <div className="flex items-center gap-2 text-rose">
                  <XCircle size={18} />
                  <span className="font-medium">Execution error</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{response.error}</p>
                {response.sql && <CodeBlock code={response.sql} className="mt-4" />}
              </Card>
            </motion.div>
          )}

          {!loading && response && response.status === "ok" && (
            <motion.div key="ok" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
              <div className="min-w-0 space-y-6">
                <Card>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Generated SQL</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {response.self_corrected && (
                        <button onClick={() => setShowCorrections((v) => !v)}>
                          <Badge tone="violet">
                            <Wrench size={11} /> self-corrected ({response.correction_attempts})
                          </Badge>
                        </button>
                      )}
                      {response.guardrail_warnings.length > 0 && (
                        <Badge tone="amber">
                          <AlertTriangle size={11} /> {response.guardrail_warnings.length} warning
                          {response.guardrail_warnings.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                      <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={explain} disabled={explainLoading}>
                        {explainLoading ? <Loader2 size={13} className="animate-spin" /> : <MessageSquareText size={13} />}
                        Explain
                      </Button>
                    </div>
                  </div>

                  {showCorrections && response.correction_history.length > 0 && (
                    <div className="mb-3 space-y-2 rounded-xl border-2 border-ink-950 bg-paper-100 p-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-violet-glow">
                        Correction history — earlier attempts that failed
                      </span>
                      {response.correction_history.map((c, i) => (
                        <div key={i}>
                          <CodeBlock code={c.sql} className="text-[11px]" />
                          <p className="mt-1 text-xs text-rose">{c.error}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <CodeBlock code={response.sql ?? ""} />
                  {response.explanation && (
                    <p className="mt-3 text-sm italic text-slate-600">{response.explanation}</p>
                  )}
                  {explainText && (
                    <div className="mt-3 rounded-xl border-2 border-ink-950 bg-[var(--color-lime)]/10 p-3 text-sm text-slate-700">
                      {explainText}
                    </div>
                  )}
                  {response.guardrail_warnings.map((w, i) => (
                    <div key={i} className="mt-2 flex items-start gap-2 rounded-lg bg-amber/10 p-2.5 text-xs text-amber">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="font-mono font-semibold">{w.rule}</span> — {w.reason}
                      </span>
                    </div>
                  ))}
                </Card>

                {response.sanity_flags.length > 0 && (
                  <Card className="border-amber/20">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Sanity flags</span>
                    <div className="mt-3 space-y-2">
                      {response.sanity_flags.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-amber">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <span>
                            <span className="font-mono">{f.check}</span> — {f.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {response.alternate_sql && (
                  <Card>
                    <div className="mb-2 flex items-center gap-2">
                      <GitCompareArrows size={15} className="text-violet-glow" />
                      <span className="text-xs uppercase tracking-wide text-slate-500">Cross-check query</span>
                      {response.alternate_agreement ? (
                        <Badge tone="mint">
                          <CheckCircle2 size={11} /> agrees
                        </Badge>
                      ) : (
                        <Badge tone="rose">
                          <XCircle size={11} /> disagrees
                        </Badge>
                      )}
                    </div>
                    <CodeBlock code={response.alternate_sql} />
                  </Card>
                )}

                <Card>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      Results — {response.row_count} row{response.row_count !== 1 ? "s" : ""}
                      {response.truncated ? " (truncated)" : ""}
                    </span>
                    <div className="flex items-center gap-3">
                      {response.query_id && response.rows.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={api.exportUrl(response.query_id, "csv")}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg border-2 border-ink-950 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-[var(--color-lime)]"
                          >
                            <Download size={11} /> CSV
                          </a>
                          <a
                            href={api.exportUrl(response.query_id, "json")}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-lg border-2 border-ink-950 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-[var(--color-lime)]"
                          >
                            <Download size={11} /> JSON
                          </a>
                        </div>
                      )}
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock size={12} /> {response.execution_time_ms?.toFixed(1)} ms
                      </span>
                    </div>
                  </div>
                  {response.rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">Query returned no rows.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border-2 border-ink-950">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-ink-950 text-xs uppercase tracking-wide text-mist-500">
                            {response.columns.map((c) => (
                              <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {response.rows.map((row, i) => (
                            <tr key={i} className="border-t border-ink-950/10 hover:bg-ink-950/5">
                              {row.map((cell, j) => (
                                <td key={j} className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                                  {cell === null ? <span className="text-slate-400">NULL</span> : String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Was this correct?</span>
                  <button
                    onClick={() => sendFeedback(true)}
                    className={`rounded-lg border p-2 transition ${feedbackSent === "up" ? "border-mint bg-mint/15 text-mint" : "border-ink-600 text-slate-600 hover:text-mint hover:border-mint/40"}`}
                  >
                    <ThumbsUp size={14} />
                  </button>
                  <button
                    onClick={() => sendFeedback(false)}
                    className={`rounded-lg border p-2 transition ${feedbackSent === "down" ? "border-rose bg-rose/15 text-rose" : "border-ink-600 text-slate-600 hover:text-rose hover:border-rose/40"}`}
                  >
                    <ThumbsDown size={14} />
                  </button>
                  <button
                    onClick={toggleFavorite}
                    title="Favorite"
                    className={`rounded-lg border p-2 transition ${favorited ? "border-amber bg-amber/15 text-amber" : "border-ink-600 text-slate-600 hover:text-amber hover:border-amber/40"}`}
                  >
                    <Star size={14} fill={favorited ? "currentColor" : "none"} />
                  </button>
                  {feedbackSent && <span className="text-xs text-slate-500">Thanks — recorded.</span>}
                  <span className="ml-auto font-mono text-[10px] text-slate-400">
                    {response.query_id?.slice(0, 8)}
                  </span>
                </div>

                <Card>
                  <span className="text-xs uppercase tracking-wide text-slate-500">Refine this query</span>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={refinement}
                      onChange={(e) => setRefinement(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && refine()}
                      placeholder="e.g. only show the top 3, or filter to last quarter"
                      className="flex-1 rounded-xl border-2 border-ink-950 bg-paper px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 outline-none focus:bg-[var(--color-lime)]/10"
                    />
                    <Button
                      variant="outline"
                      onClick={refine}
                      disabled={refining || !refinement.trim()}
                      className="text-sm"
                    >
                      {refining ? <Loader2 size={14} className="animate-spin" /> : <CornerDownRight size={14} />}
                      Refine
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Follow-ups run through the same guardrails and hallucination checks as any new question.
                  </p>
                </Card>
              </div>

              {/* Sidebar: confidence breakdown */}
              <div className="space-y-4">
                <Card className="flex flex-col items-center text-center">
                  <span className="mb-3 text-xs uppercase tracking-wide text-slate-500">Confidence</span>
                  <ConfidenceOrb value={response.confidence?.overall ?? 0} size={120} />
                </Card>
                {response.confidence && (
                  <Card className="space-y-4">
                    <ProgressBar
                      tone="cyan"
                      label="Back-translation alignment"
                      value={response.confidence.back_translation_alignment}
                    />
                    <ProgressBar
                      tone="mint"
                      label="Sanity check pass rate"
                      value={response.confidence.sanity_check_pass_rate}
                    />
                    <ProgressBar
                      tone="violet"
                      label="Schema coverage"
                      value={response.confidence.schema_coverage_score}
                    />
                    {response.confidence.multi_query_agreement !== null && (
                      <ProgressBar
                        tone="amber"
                        label="Multi-query agreement"
                        value={response.confidence.multi_query_agreement}
                      />
                    )}
                  </Card>
                )}
                <Card>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Rows3 size={13} /> {response.columns.length} columns returned
                  </div>
                </Card>
              </div>
            </motion.div>
          )}
        </>
      </div>
    </PageShell>
  );
}
