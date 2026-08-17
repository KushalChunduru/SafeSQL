import { useEffect, useMemo, useState } from "react";
import { Database, KeyRound, Link2, Loader2, XCircle } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { api } from "../api/client";
import type { SchemaDict } from "../types";

const CANVAS_W = 1000;
const CANVAS_H = 620;

function layout(names: string[]) {
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const rx = CANVAS_W * 0.4;
  const ry = CANVAS_H * 0.36;
  const n = Math.max(names.length, 1);
  return Object.fromEntries(
    names.map((name, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      return [name, { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }];
    })
  );
}

export default function SchemaExplorer() {
  const [schema, setSchema] = useState<SchemaDict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api
      .schema()
      .then((s) => {
        setSchema(s);
        setSelected((prev) => prev ?? Object.keys(s)[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load schema"));
  }, []);

  const tableNames = useMemo(() => (schema ? Object.keys(schema) : []), [schema]);
  const positions = useMemo(() => layout(tableNames), [tableNames]);

  const links = useMemo(() => {
    if (!schema) return [];
    const out: { from: string; to: string; label: string }[] = [];
    for (const [table, info] of Object.entries(schema)) {
      for (const fk of info.foreign_keys) {
        const [refTable] = fk.references.split(".");
        if (positions[table] && positions[refTable]) {
          out.push({ from: table, to: refTable, label: fk.column });
        }
      }
    }
    return out;
  }, [schema, positions]);

  const selectedInfo = selected && schema ? schema[selected] : null;
  const relatedTo = (name: string) =>
    links.filter((l) => l.from === name || l.to === name).map((l) => (l.from === name ? l.to : l.from));

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <Badge tone="violet">
          <Database size={12} /> Schema Explorer
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">
          The database, mapped out
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Every table SafeSQL is allowed to query — live from <code className="font-mono text-xs">GET /v1/schema</code>.
          Click a table to see its columns, keys, and sample values.
        </p>

        {error && (
          <Card className="mt-6 border-rose/30">
            <div className="flex items-center gap-2 text-rose">
              <XCircle size={16} /> {error}
            </div>
          </Card>
        )}

        {!schema && !error && (
          <Card className="mt-6 flex items-center gap-3 text-slate-600">
            <Loader2 size={16} className="animate-spin text-cyan-glow" /> Loading schema…
          </Card>
        )}

        {schema && (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <Card className="relative min-w-0 overflow-hidden p-2">
              <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="h-[560px] w-full">
                <defs>
                  <marker id="er-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M0 0 L8 4 L0 8 z" fill="#3a4863" />
                  </marker>
                </defs>
                {links.map((l, i) => {
                  const a = positions[l.from];
                  const b = positions[l.to];
                  if (!a || !b) return null;
                  const highlighted = selected === l.from || selected === l.to;
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2 - 26;
                  return (
                    <path
                      key={i}
                      d={`M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={highlighted ? "#67e8f9" : "#26314a"}
                      strokeWidth={highlighted ? 2 : 1.3}
                      markerEnd="url(#er-arrow)"
                      className="transition-all duration-300"
                    />
                  );
                })}
                {tableNames.map((name) => {
                  const p = positions[name];
                  const info = schema[name];
                  const isSelected = selected === name;
                  const dimmed = selected && !isSelected && !relatedTo(selected).includes(name);
                  return (
                    <g
                      key={name}
                      transform={`translate(${p.x} ${p.y})`}
                      onClick={() => setSelected(name)}
                      className="cursor-pointer"
                      opacity={dimmed ? 0.4 : 1}
                    >
                      <rect
                        x={-78}
                        y={-30}
                        width={156}
                        height={60}
                        rx={14}
                        fill="#0e1420"
                        stroke={isSelected ? "#67e8f9" : "#3a4863"}
                        strokeWidth={isSelected ? 2 : 1.3}
                        className="transition-all duration-300"
                      />
                      <text x={0} y={-4} textAnchor="middle" fill="#eef2f8" fontSize="13.5" fontFamily="Space Grotesk, sans-serif" fontWeight={600}>
                        {name}
                      </text>
                      <text x={0} y={14} textAnchor="middle" fill="#7c88a1" fontSize="10" fontFamily="Inter, sans-serif">
                        {info.columns.length} columns
                      </text>
                    </g>
                  );
                })}
              </svg>
            </Card>

            <div className="min-w-0">
              {selectedInfo && selected && (
                <Card className="sticky top-24">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-cyan-glow" />
                    <h2 className="font-display text-lg font-semibold text-slate-950">{selected}</h2>
                  </div>
                  {selectedInfo.description && (
                    <p className="mt-2 text-sm text-slate-600">{selectedInfo.description}</p>
                  )}

                  <div className="mt-4 space-y-2">
                    {selectedInfo.columns.map((c) => (
                      <div key={c.name} className="rounded-lg border-2 border-ink-950 bg-ink-950 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-xs text-mist-100">
                            {c.primary_key && <KeyRound size={11} className="text-[var(--color-sun)]" />}
                            {c.name}
                          </span>
                          <span className="font-mono text-[10px] text-mist-500">{c.type}</span>
                        </div>
                        {c.sample_values.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {c.sample_values.slice(0, 6).map((v, i) => (
                              <span key={i} className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
                                {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {selectedInfo.foreign_keys.length > 0 && (
                    <div className="mt-4">
                      <span className="text-xs uppercase tracking-wide text-slate-500">Foreign keys</span>
                      <div className="mt-2 space-y-1.5">
                        {selectedInfo.foreign_keys.map((fk) => (
                          <div key={fk.column} className="flex items-center gap-1.5 font-mono text-xs text-slate-700">
                            <Link2 size={11} className="text-violet-glow" />
                            {fk.column} → {fk.references}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
