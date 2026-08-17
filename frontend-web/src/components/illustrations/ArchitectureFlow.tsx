interface FlowNode {
  x: number;
  y: number;
  w: number;
  label: string;
  sub: string;
  tone: "cyan" | "violet" | "mint" | "amber" | "rose" | "mist";
}

const TONE: Record<FlowNode["tone"], string> = {
  cyan: "#5b7fff",
  violet: "#a276f5",
  mint: "#3ec37e",
  amber: "#ffb84d",
  rose: "#ff6b85",
  mist: "#c7c6d1",
};

const MAIN: FlowNode[] = [
  { x: 310, y: 34, w: 190, label: "Question", sub: "natural language input", tone: "mist" },
  { x: 310, y: 116, w: 220, label: "Ambiguity check", sub: '"revenue" → gross or net?', tone: "cyan" },
  { x: 310, y: 198, w: 230, label: "Schema-aware prompt", sub: "filtered tables + few-shot", tone: "cyan" },
  { x: 310, y: 280, w: 210, label: "LLM generation", sub: "structured SQL output", tone: "violet" },
  { x: 310, y: 362, w: 240, label: "Guardrail middleware", sub: "DDL/DML block · row cap · depth", tone: "mint" },
  { x: 310, y: 444, w: 230, label: "Sandboxed execution", sub: "read-only role · rolled back", tone: "mint" },
];

const BRANCHES: FlowNode[] = [
  { x: 120, y: 560, w: 170, label: "Back-translation", sub: "alignment score", tone: "amber" },
  { x: 310, y: 560, w: 160, label: "Sanity checks", sub: "nulls · ranges · signs", tone: "amber" },
  { x: 500, y: 560, w: 180, label: "Cross-check query", sub: "independent 2nd SQL", tone: "amber" },
];

const TAIL: FlowNode[] = [
  { x: 310, y: 660, w: 200, label: "Confidence score", sub: "weighted combination", tone: "rose" },
  { x: 310, y: 742, w: 190, label: "Response + UI", sub: "SQL · results · rationale", tone: "rose" },
];

const SIDE_NOTES = [
  { x: 560, y: 116, text: "clarify instead\nof guessing", anchor: "start" as const, from: { x: 420, y: 116 } },
  { x: 560, y: 362, text: "blocked +\naudit-logged", anchor: "start" as const, from: { x: 430, y: 362 } },
];

function Node({ n }: { n: FlowNode }) {
  const c = TONE[n.tone];
  return (
    <g transform={`translate(${n.x - n.w / 2} ${n.y - 22})`}>
      <rect
        width={n.w}
        height={44}
        rx={12}
        fill="#0e0e10"
        stroke={c}
        strokeOpacity={0.55}
        strokeWidth={1.4}
      />
      <circle cx={18} cy={22} r={4.5} fill={c} />
      <text x={34} y={19} fill="#eef2f8" fontSize="12.5" fontFamily="Space Grotesk, sans-serif" fontWeight={600}>
        {n.label}
      </text>
      <text x={34} y={33} fill="#7c88a1" fontSize="9.5" fontFamily="Inter, sans-serif">
        {n.sub}
      </text>
    </g>
  );
}

function VLink({ from, to }: { from: FlowNode; to: FlowNode }) {
  return (
    <path
      d={`M${from.x} ${from.y + 22} L${to.x} ${to.y - 22}`}
      stroke="#3a4863"
      strokeWidth={1.5}
      markerEnd="url(#arrow)"
    />
  );
}

function DiagLink({ from, to }: { from: FlowNode; to: FlowNode }) {
  const midY = (from.y + to.y) / 2;
  return (
    <path
      d={`M${from.x} ${from.y + 22} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - 22}`}
      stroke="#3a4863"
      strokeWidth={1.5}
      fill="none"
      markerEnd="url(#arrow)"
    />
  );
}

/** Full pipeline architecture diagram used on the landing page's "How it works" section. */
export default function ArchitectureFlow({ className = "" }: { className?: string }) {
  const execNode = MAIN[MAIN.length - 1];
  return (
    <svg viewBox="0 0 660 790" className={className} fill="none" aria-hidden="true">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#3a4863" />
        </marker>
      </defs>

      {MAIN.slice(1).map((n, i) => (
        <VLink key={n.label} from={MAIN[i]} to={n} />
      ))}
      {BRANCHES.map((b) => (
        <DiagLink key={b.label} from={execNode} to={b} />
      ))}
      {BRANCHES.map((b) => (
        <DiagLink key={`${b.label}-merge`} from={b} to={TAIL[0]} />
      ))}
      <VLink from={TAIL[0]} to={TAIL[1]} />

      {SIDE_NOTES.map((s) => (
        <g key={s.text}>
          <path
            d={`M${s.from.x} ${s.from.y} L${s.x - 6} ${s.y}`}
            stroke="#3a4863"
            strokeDasharray="3 4"
            strokeWidth={1.2}
          />
          {s.text.split("\n").map((line, idx) => (
            <text
              key={line}
              x={s.x}
              y={s.y - 4 + idx * 11}
              fill="#5a6580"
              fontSize="9.5"
              fontStyle="italic"
              fontFamily="Inter, sans-serif"
            >
              {line}
            </text>
          ))}
        </g>
      ))}

      {MAIN.map((n) => (
        <Node key={n.label} n={n} />
      ))}
      {BRANCHES.map((n) => (
        <Node key={n.label} n={n} />
      ))}
      {TAIL.map((n) => (
        <Node key={n.label} n={n} />
      ))}
    </svg>
  );
}
