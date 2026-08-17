interface Props {
  value: number; // 0-1
  label: string;
  tone?: "cyan" | "violet" | "mint" | "amber" | "rose";
}

const TONE_HEX: Record<string, string> = {
  cyan: "#2b52ff",
  violet: "#7c3aed",
  mint: "#0f9d58",
  amber: "#d97706",
  rose: "#e11d3f",
};

export default function ProgressBar({ value, label, tone = "cyan" }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono font-bold text-slate-950">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full border-2 border-ink-950 bg-paper-100">
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: TONE_HEX[tone] }}
        />
      </div>
    </div>
  );
}
