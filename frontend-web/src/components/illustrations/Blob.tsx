interface Props {
  className?: string;
  from?: string;
  to?: string;
}

/** Soft ambient gradient glow used behind hero/panel sections. Purely decorative. */
export default function Blob({ className = "", from = "#22d3ee", to = "#8b5cf6" }: Props) {
  const id = `blob-${from.replace("#", "")}-${to.replace("#", "")}`;
  return (
    <div className={`pointer-events-none absolute -z-10 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 400" className="h-full w-full animate-drift">
        <defs>
          <radialGradient id={id} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={from} stopOpacity="0.35" />
            <stop offset="100%" stopColor={to} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="200" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
