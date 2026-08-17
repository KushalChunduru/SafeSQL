import type { ReactNode } from "react";
import clsx from "clsx";

type Tone = "cyan" | "violet" | "mint" | "amber" | "rose" | "mist";

const TONE_CLASSES: Record<Tone, string> = {
  cyan: "bg-[var(--color-cyan-glow)]/10 text-[var(--color-cyan-glow)] border-ink-950",
  violet: "bg-[var(--color-violet-glow)]/10 text-[var(--color-violet-glow)] border-ink-950",
  mint: "bg-[var(--color-mint)]/10 text-[var(--color-mint)] border-ink-950",
  amber: "bg-[var(--color-amber)]/10 text-[var(--color-amber)] border-ink-950",
  rose: "bg-[var(--color-rose)]/10 text-[var(--color-rose)] border-ink-950",
  mist: "bg-slate-500/10 text-slate-700 border-ink-950",
};

export default function Badge({ tone = "mist", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[11px] font-bold tracking-wide",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
