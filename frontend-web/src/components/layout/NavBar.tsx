import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { Cpu } from "lucide-react";
import ShieldMark from "../illustrations/ShieldMark";
import { api } from "../../api/client";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/workspace", label: "Workspace" },
  { to: "/schema", label: "Schema" },
  { to: "/history", label: "History" },
  { to: "/safety", label: "Safety" },
];

export default function NavBar() {
  const [providerLabel, setProviderLabel] = useState<string | null>(null);

  useEffect(() => {
    api
      .providers()
      .then((p) => setProviderLabel(p.active_provider))
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink-950 bg-ink-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-3">
          <NavLink to="/" className="flex items-center gap-2.5">
            <ShieldMark size={26} />
            <span className="font-display text-lg font-extrabold tracking-tight text-mist-100">
              SafeSQL
            </span>
          </NavLink>
          {providerLabel && (
            <span className="hidden items-center gap-1.5 rounded-full border-2 border-ink-700 bg-ink-900 px-2.5 py-1 font-mono text-[11px] font-semibold text-mist-300 sm:flex">
              <Cpu size={11} /> {providerLabel}
            </span>
          )}
        </div>

        <nav className="hidden items-center gap-1 rounded-full border-2 border-ink-700 bg-ink-900 p-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  isActive ? "bg-[var(--color-lime)] text-ink-950" : "text-mist-500 hover:text-mist-100"
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/workspace"
          className="rounded-xl border-2 border-mist-100 bg-[var(--color-lime)] px-4 py-2 text-sm font-extrabold text-ink-950 shadow-[3px_3px_0_0_var(--color-mist-100)] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_var(--color-mist-100)]"
        >
          Launch
        </NavLink>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t-2 border-ink-800 px-4 py-2 md:hidden">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              clsx(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                isActive ? "bg-[var(--color-lime)] text-ink-950" : "text-mist-500"
              )
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
