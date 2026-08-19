import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { History as HistoryIcon, RotateCcw, ThumbsDown, ThumbsUp, XCircle, Loader2, Star } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import CodeBlock from "../components/ui/CodeBlock";
import { api } from "../api/client";
import { getSessionId } from "../lib/session";
import type { HistoryItem } from "../types";

const STATUS_TONE: Record<string, "mint" | "amber" | "rose" | "mist"> = {
  ok: "mint",
  needs_clarification: "amber",
  blocked: "rose",
  error: "rose",
};

export default function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  function load(favOnly: boolean) {
    setError(null);
    api
      .history(getSessionId(), favOnly)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load history"));
  }

  useEffect(() => {
    load(favoritesOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesOnly]);

  async function toggleFavorite(item: HistoryItem, e: MouseEvent) {
    e.stopPropagation();
    const next = !item.favorite;
    setItems((prev) => prev?.map((i) => (i.query_id === item.query_id ? { ...i, favorite: next } : i)) ?? prev);
    try {
      await api.setFavorite(item.query_id, next);
    } catch {
      load(favoritesOnly);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Badge tone="cyan">
          <HistoryIcon size={12} /> Session history
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">
          Everything you've asked this session
        </h1>
        <p className="mt-2 text-slate-600">
          Stored in-memory per session — the flywheel described in the eval suite: confirmed-correct
          answers become future few-shot examples, confirmed-wrong ones become regression cases.
        </p>

        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`mt-4 flex items-center gap-1.5 rounded-full border-2 border-ink-950 px-3 py-1.5 text-xs font-semibold transition ${
            favoritesOnly ? "bg-amber text-ink-950" : "bg-paper text-slate-700 hover:bg-[var(--color-lime)]"
          }`}
        >
          <Star size={12} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites only
        </button>

        {error && (
          <Card className="mt-6 border-rose/30">
            <div className="flex items-center gap-2 text-rose">
              <XCircle size={16} /> {error}
            </div>
          </Card>
        )}

        {!items && !error && (
          <Card className="mt-6 flex items-center gap-3 text-slate-600">
            <Loader2 size={16} className="animate-spin text-cyan-glow" /> Loading…
          </Card>
        )}

        {items && items.length === 0 && (
          <Card className="mt-6 text-center text-slate-500">
            No queries yet.{" "}
            <Link to="/workspace" className="text-cyan-glow hover:underline">
              Ask something
            </Link>{" "}
            to see it show up here.
          </Card>
        )}

        <div className="mt-6 space-y-3">
          {items?.map((item, i) => (
            <motion.div key={item.query_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card>
                <div
                  role="button"
                  tabIndex={0}
                  className="flex w-full cursor-pointer items-start justify-between gap-4 text-left"
                  onClick={() => setExpanded(expanded === item.query_id ? null : item.query_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setExpanded(expanded === item.query_id ? null : item.query_id);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-950">{item.question}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                      <Badge tone={STATUS_TONE[item.status] ?? "mist"}>{item.status}</Badge>
                      {item.confidence_overall !== null && (
                        <span className="font-mono">{Math.round(item.confidence_overall * 100)}% confidence</span>
                      )}
                      {item.feedback === true && <ThumbsUp size={12} className="text-mint" />}
                      {item.feedback === false && <ThumbsDown size={12} className="text-rose" />}
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => toggleFavorite(item, e)}
                    title="Favorite"
                    className={`shrink-0 rounded-lg border-2 p-2 transition ${
                      item.favorite
                        ? "border-amber bg-amber/15 text-amber"
                        : "border-ink-950 text-slate-700 hover:bg-[var(--color-lime)]"
                    }`}
                  >
                    <Star size={14} fill={item.favorite ? "currentColor" : "none"} />
                  </button>
                  <Link
                    to={`/workspace?q=${encodeURIComponent(item.question)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-lg border-2 border-ink-950 p-2 text-slate-700 transition hover:bg-[var(--color-lime)]"
                    title="Ask again"
                  >
                    <RotateCcw size={14} />
                  </Link>
                </div>
                {expanded === item.query_id && item.sql && (
                  <div className="mt-3">
                    <CodeBlock code={item.sql} />
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
