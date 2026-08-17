import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export default function Card({
  children,
  className,
  glow = false,
  tilt = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; glow?: boolean; tilt?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border-2 border-ink-950 bg-paper p-5 transition-transform",
        glow
          ? "shadow-[6px_6px_0_0_var(--color-cyan-glow)]"
          : "shadow-[var(--shadow-brut)]",
        tilt && "-rotate-1 hover:rotate-0",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
