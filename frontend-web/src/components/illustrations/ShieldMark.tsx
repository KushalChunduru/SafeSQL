interface Props {
  className?: string;
  size?: number;
}

/** Hand-drawn-style monoline shield-check mark — the SafeSQL brand glyph. */
export default function ShieldMark({ className = "", size = 28 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shieldGrad" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c6ff3b" />
          <stop offset="1" stopColor="#2b52ff" />
        </linearGradient>
      </defs>
      <path
        d="M32 5 L55 14.5 V30 C55 45.5 45.5 55 32 59 C18.5 55 9 45.5 9 30 V14.5 Z"
        stroke="url(#shieldGrad)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 31.5 L28 39 L44 22.5"
        stroke="url(#shieldGrad)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
