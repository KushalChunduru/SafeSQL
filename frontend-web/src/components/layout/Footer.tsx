import ShieldMark from "../illustrations/ShieldMark";

export default function Footer() {
  return (
    <footer className="border-t-2 border-ink-950 bg-ink-950 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-mist-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <ShieldMark size={18} />
          <span className="text-mist-300">SafeSQL — text-to-SQL with guardrails and hallucination detection.</span>
        </div>
        <span className="font-mono text-xs text-mist-600">
          zero unsafe queries executed · confidence-scored answers
        </span>
      </div>
    </footer>
  );
}
