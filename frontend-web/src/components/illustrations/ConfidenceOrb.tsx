interface Props {
  value: number; // 0-1
  size?: number;
  label?: string;
}

function toneFor(value: number) {
  if (value >= 0.75) return "#0f9d58";
  if (value >= 0.5) return "#d97706";
  return "#e11d3f";
}

/** A bold ring gauge for the overall confidence score — thick track, hard-edged, no blur. */
export default function ConfidenceOrb({ value, size = 96, label }: Props) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const offset = c * (1 - clamped);
  const color = toneFor(clamped);

  return (
    <div className="relative inline-flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eee6d3" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1), stroke 0.4s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-xl font-bold text-slate-950">{Math.round(clamped * 100)}%</span>
        {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      </div>
    </div>
  );
}
