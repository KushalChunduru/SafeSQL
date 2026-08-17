import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--color-cyan-glow)] text-white border-2 border-ink-950 shadow-[var(--shadow-brut-sm)]",
  secondary: "bg-[var(--color-coral)] text-white border-2 border-ink-950 shadow-[var(--shadow-brut-sm)]",
  ghost: "text-slate-700 hover:text-slate-950 hover:bg-ink-950/5 border-2 border-transparent",
  outline: "bg-paper text-slate-950 border-2 border-ink-950 shadow-[var(--shadow-brut-sm)]",
  danger: "bg-[var(--color-rose)] text-white border-2 border-ink-950 shadow-[var(--shadow-brut-sm)]",
};

const PRESSABLE: Record<Variant, boolean> = {
  primary: true,
  secondary: true,
  ghost: false,
  outline: true,
  danger: true,
};

export default function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: Variant }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        PRESSABLE[variant] &&
          "hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_var(--color-ink-950)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
