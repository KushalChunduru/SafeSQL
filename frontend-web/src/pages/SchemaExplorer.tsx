import { useEffect, useMemo, useRef, useState } from "react";
import { Database, KeyRound, Link2, Loader2, XCircle, Upload, CheckCircle2, Trash2 } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { api } from "../api/client";
import type { DatasetInfo, SchemaDict } from "../types";

const CANVAS_W = 1000;
const CANVAS_H = 620;
const CORE_CY = 230;

// Core (seeded/FK-connected) tables sit on an ellipse in the upper area.
// Imported tables never share that ellipse — they get their own row lower
// down, so a long imported table name can never overlap a core node.
function layout(coreNames: string[], importedNames: string[]) {
  const positions: Record<string, { x: number; y: number }> = {};

  const cx = CANVAS_W / 2;
  const rx = CANVAS_W * 0.38;
  const ry = 150;
  const n = Math.max(coreNames.length, 1);
  coreNames.forEach((name, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    positions[name] = { x: cx + rx * Math.cos(angle), y: CORE_CY + ry * Math.sin(angle) };
  });

  const rowY = 530;
  const m = importedNames.length;
  if (m > 0) {
    const spacing = Math.min(230, (CANVAS_W - 140) / m);
    const startX = cx - ((m - 1) * spacing) / 2;
    importedNames.forEach((name, i) => {
      positions[name] = { x: startX + i * spacing, y: rowY };
    });
  }

  return positions;
}

function truncateLabel(name: string, max = 17) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export default function SchemaExplorer() {
  const [schema, setSchema] = useState<SchemaDict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [datasetToRemove, setDatasetToRemove] = useState<string>("");
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadSchemaAndDatasets() {
    api
      .schema()
      .then((s) => {
        setSchema(s);
        setSelected((prev) => prev ?? Object.keys(s)[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load schema"));
    api.listDatasets().then(setDatasets).catch(() => {});
  }

  useEffect(() => {
    loadSchemaAndDatasets();
  }, []);

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const result = await api.importDataset(file);
      setImportSuccess(`Imported "${result.table_name}" — ${result.row_count} rows.`);
      loadSchemaAndDatasets();
      setSelected(result.table_name);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const importedTableNames = useMemo(() => new Set(datasets.map((d) => d.table_name)), [datasets]);

  useEffect(() => {
    if (datasets.length === 0) {
      setDatasetToRemove("");
    } else if (!datasets.some((d) => d.table_name === datasetToRemove)) {
      setDatasetToRemove(datasets[0].table_name);
    }
  }, [datasets, datasetToRemove]);

  async function handleRemoveDataset() {
    if (!datasetToRemove) return;
    setRemoving(true);
    setImportError(null);
    try {
      await api.deleteDataset(datasetToRemove);
      setImportSuccess(`Removed "${datasetToRemove}".`);
      if (selected === datasetToRemove) setSelected(null);
      loadSchemaAndDatasets();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setRemoving(false);
    }
  }

  const tableNames = useMemo(() => (schema ? Object.keys(schema) : []), [schema]);
  const coreTableNames = useMemo(
    () => tableNames.filter((n) => !importedTableNames.has(n)),
    [tableNames, importedTableNames]
  );
  const importedTableNamesInSchema = useMemo(
    () => tableNames.filter((n) => importedTableNames.has(n)),
    [tableNames, importedTableNames]
  );
  const positions = useMemo(
    () => layout(coreTableNames, importedTableNamesInSchema),
    [coreTableNames, importedTableNamesInSchema]
  );

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

        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-cyan-glow" />
              <div>
                <span className="text-sm font-semibold text-slate-950">Import your own data</span>
                <p className="text-xs text-slate-500">
                  CSV or Excel — loaded as a new table, queryable through the exact same guardrails.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                className="text-sm"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? "Importing…" : "Choose file"}
              </Button>
            </div>
          </div>
          {importSuccess && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-mint/10 p-2.5 text-xs text-mint">
              <CheckCircle2 size={13} /> {importSuccess}
            </div>
          )}
          {importError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose/10 p-2.5 text-xs text-rose">
              <XCircle size={13} /> {importError}
            </div>
          )}
          {datasets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-slate-500">Imported datasets</span>
              <select
                value={datasetToRemove}
                onChange={(e) => setDatasetToRemove(e.target.value)}
                className="rounded-lg border-2 border-ink-950 bg-paper-100 px-2.5 py-1.5 font-mono text-xs text-slate-700"
              >
                {datasets.map((d) => (
                  <option key={d.table_name} value={d.table_name}>
                    {d.table_name} ({d.row_count} rows)
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                className="text-xs"
                disabled={!datasetToRemove || removing}
                onClick={handleRemoveDataset}
              >
                {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Remove
              </Button>
            </div>
          )}
        </Card>

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
                {importedTableNamesInSchema.length > 0 && (
                  <text
                    x={CANVAS_W / 2}
                    y={470}
                    textAnchor="middle"
                    fill="#5c6b8a"
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    letterSpacing="1.5"
                  >
                    IMPORTED
                  </text>
                )}
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
                        strokeDasharray={importedTableNames.has(name) ? "5 4" : undefined}
                        className="transition-all duration-300"
                      />
                      <title>{name}</title>
                      <text x={0} y={-4} textAnchor="middle" fill="#eef2f8" fontSize="13.5" fontFamily="Space Grotesk, sans-serif" fontWeight={600}>
                        {truncateLabel(name)}
                      </text>
                      <text x={0} y={14} textAnchor="middle" fill="#7c88a1" fontSize="10" fontFamily="Inter, sans-serif">
                        {info.columns.length} columns{importedTableNames.has(name) ? " · imported" : ""}
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
