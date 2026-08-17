import type { ReactNode } from "react";

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-paper-50">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_-10%,black,transparent)]" />
      <div className="relative">{children}</div>
    </div>
  );
}
