import { useMemo } from "react";

const KEYWORDS = new Set([
  "select", "from", "where", "join", "left", "right", "inner", "outer", "on", "group", "by",
  "order", "limit", "as", "and", "or", "not", "in", "is", "null", "distinct", "having",
  "with", "case", "when", "then", "else", "end", "asc", "desc", "between", "like", "count",
  "sum", "avg", "max", "min", "insert", "update", "delete", "create", "drop", "alter",
  "interval", "extract", "date_trunc", "current_date", "union", "all",
]);

type Token = { text: string; kind: "keyword" | "string" | "number" | "comment" | "punct" | "plain" };

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const re = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([a-zA-Z_][a-zA-Z0-9_]*)|([(),.;*=<>!+\-/])|(\s+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    const [, comment, str, num, word, punct, space] = match;
    if (comment) tokens.push({ text: comment, kind: "comment" });
    else if (str) tokens.push({ text: str, kind: "string" });
    else if (num) tokens.push({ text: num, kind: "number" });
    else if (word) tokens.push({ text: word, kind: KEYWORDS.has(word.toLowerCase()) ? "keyword" : "plain" });
    else if (punct) tokens.push({ text: punct, kind: "punct" });
    else if (space) tokens.push({ text: space, kind: "plain" });
  }
  return tokens;
}

const KIND_CLASS: Record<Token["kind"], string> = {
  keyword: "text-violet-glow font-semibold",
  string: "text-mint",
  number: "text-amber",
  comment: "text-mist-600 italic",
  punct: "text-mist-500",
  plain: "text-mist-100",
};

export default function CodeBlock({ code, className = "" }: { code: string; className?: string }) {
  const tokens = useMemo(() => tokenize(code), [code]);
  return (
    <pre
      className={`font-mono overflow-x-auto rounded-xl border-2 border-ink-950 bg-ink-950 p-4 text-[13px] leading-relaxed shadow-[var(--shadow-brut-sm)] ${className}`}
    >
      <code>
        {tokens.map((t, i) => (
          <span key={i} className={KIND_CLASS[t.kind]}>
            {t.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
