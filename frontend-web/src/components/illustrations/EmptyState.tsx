/** Line-art "nothing here yet" illustration — a magnifying glass over an empty table. */
export default function EmptyState({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} fill="none" aria-hidden="true">
      <rect x="20" y="30" width="90" height="64" rx="6" stroke="#15151a" strokeWidth="2.2" />
      <path d="M20 50 h90 M20 70 h90 M52 30 v64 M84 30 v64" stroke="#8c8c96" strokeWidth="1.5" />
      <g transform="translate(104 74)">
        <circle r="20" fill="#fffdf8" stroke="#2b52ff" strokeWidth="2.6" />
        <path d="M14 14 L28 28" stroke="#2b52ff" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M-8 0 h16 M0 -8 v16" stroke="#8c8c96" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      </g>
    </svg>
  );
}
