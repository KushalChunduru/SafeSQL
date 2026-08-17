interface NodeSpec {
  cx: number;
  label: string;
  sub: string;
  icon: "chat" | "spark" | "shield" | "db" | "chart";
  accent: string;
}

const NODES: NodeSpec[] = [
  { cx: 90, label: "Ask", sub: "plain English", icon: "chat", accent: "#2b52ff" },
  { cx: 280, label: "Reason", sub: "schema-aware LLM", icon: "spark", accent: "#7c3aed" },
  { cx: 470, label: "Guard", sub: "block + sandbox", icon: "shield", accent: "#0f9d58" },
  { cx: 660, label: "Verify", sub: "cross-checked", icon: "chart", accent: "#d97706" },
];

function NodeIcon({ type, color }: { type: NodeSpec["icon"]; color: string }) {
  const common = { stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (type) {
    case "chat":
      return (
        <g {...common}>
          <path d="M-14 -10 h28 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-16 l-8 7 v-7 h-4 a6 6 0 0 1 -6 -6 v-8 a6 6 0 0 1 6 -6 z" />
          <path d="M-8 -1 h20 M-8 5 h13" />
        </g>
      );
    case "spark":
      return (
        <g {...common}>
          <path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" />
          <circle cx="13" cy="-13" r="2" fill={color} stroke="none" />
        </g>
      );
    case "shield":
      return (
        <g {...common}>
          <path d="M0 -15 L14 -10 V4 C14 13 8 18 0 21 C-8 18 -14 13 -14 4 V-10 Z" />
          <path d="M-6.5 1 L-1.5 6.5 L8 -4" />
        </g>
      );
    case "db":
      return (
        <g {...common}>
          <ellipse cx="0" cy="-10" rx="13" ry="5" />
          <path d="M-13 -10 v16 a13 5 0 0 0 26 0 v-16" />
          <path d="M-13 -2 a13 5 0 0 0 26 0" />
        </g>
      );
    case "chart":
      return (
        <g {...common}>
          <path d="M-14 14 v-24 M-14 14 h28" />
          <path d="M-9 9 v-8 M-1 9 v-14 M7 9 v-5" strokeWidth="3.2" />
          <path d="M-9 -6 L-1 -12 L7 -8 L13 -16" strokeDasharray="1 5" />
        </g>
      );
  }
}

/** The landing-page hero: a hand-drawn-style flow diagram of the SafeSQL pipeline,
 *  with a slow animated dashed connector and gently drifting accents. */
export default function HeroPipeline({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 760 220" className={className} fill="none" aria-hidden="true">
      {/* connector line */}
      <path
        d="M90 110 H660"
        stroke="url(#flowGrad)"
        strokeWidth="2"
        strokeDasharray="6 10"
        className="animate-dash"
      />
      <defs>
        <linearGradient id="flowGrad" x1="90" y1="0" x2="660" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2b52ff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#7c3aed" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d97706" stopOpacity="0.9" />
        </linearGradient>
        {NODES.map((n) => (
          <radialGradient key={n.label} id={`glow-${n.label}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={n.accent} stopOpacity="0.35" />
            <stop offset="1" stopColor={n.accent} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      {/* decorative drifting dots */}
      <g className="animate-drift" opacity="0.5">
        <circle cx="150" cy="40" r="2" fill="#2b52ff" />
        <circle cx="560" cy="190" r="2.5" fill="#d97706" />
        <circle cx="380" cy="30" r="1.6" fill="#7c3aed" />
      </g>

      {NODES.map((n) => (
        <g key={n.label} transform={`translate(${n.cx} 110)`}>
          <circle r="36" fill={`url(#glow-${n.label})`} />
          <circle r="30" fill="#0e0e10" stroke={n.accent} strokeOpacity="0.85" strokeWidth="2" />
          <NodeIcon type={n.icon} color={n.accent} />
          <text
            y="56"
            textAnchor="middle"
            fill="#15151a"
            fontSize="13"
            fontFamily="Space Grotesk, sans-serif"
            fontWeight={700}
          >
            {n.label}
          </text>
          <text y="72" textAnchor="middle" fill="#6c6c78" fontSize="10.5" fontFamily="Inter, sans-serif">
            {n.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}
