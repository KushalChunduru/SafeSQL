import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Database,
  Gauge,
  GitCompareArrows,
  Sparkles,
  Lock,
  SearchCode,
  ArrowRight,
  MessageCircleQuestion,
} from "lucide-react";
import PageShell from "../components/layout/PageShell";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import HeroPipeline from "../components/illustrations/HeroPipeline";
import ArchitectureFlow from "../components/illustrations/ArchitectureFlow";
import Blob from "../components/illustrations/Blob";
import ShieldMark from "../components/illustrations/ShieldMark";

const STATS = [
  { value: "8/8", label: "adversarial queries blocked", tone: "mint" as const },
  { value: "0", label: "unsafe queries ever executed", tone: "mint" as const },
  { value: "42", label: "golden eval cases", tone: "cyan" as const },
  { value: "3", label: "independent safety layers", tone: "violet" as const },
];

const FEATURES = [
  {
    icon: SearchCode,
    tone: "cyan" as const,
    title: "Schema-aware prompting",
    body: "The model never sees your whole database. Tables are filtered by relevance to the question, then enriched with foreign keys, sample values, and business-glossary definitions so joins and terminology resolve correctly on the first attempt.",
  },
  {
    icon: MessageCircleQuestion,
    tone: "violet" as const,
    title: "Ambiguity resolution",
    body: "“Revenue” could mean gross or net. Rather than pick one silently, SafeSQL detects the ambiguity, shows both interpretations with example SQL, and lets you choose — a guess never ships as an answer.",
  },
  {
    icon: ShieldCheck,
    tone: "mint" as const,
    title: "Guardrail middleware",
    body: "Every generated query is parsed before it runs: DDL and DML are blocked outright, row limits are enforced automatically, subquery depth is capped, and oversized scans are rejected via EXPLAIN. Every block is logged with its reason.",
  },
  {
    icon: Lock,
    tone: "mint" as const,
    title: "Sandboxed execution",
    body: "Approved queries still run inside a transaction that is always rolled back, against a database role with SELECT-only privileges. If a write somehow clears the guardrail layer, the database itself refuses to persist it.",
  },
  {
    icon: GitCompareArrows,
    tone: "amber" as const,
    title: "Hallucination detection",
    body: "Back-translation checks that the SQL still answers the original question. Sanity checks catch null-heavy joins and implausible values. A second, independently-generated query cross-checks the first result before you see it.",
  },
  {
    icon: Gauge,
    tone: "rose" as const,
    title: "Confidence scoring",
    body: "Every answer carries a weighted confidence score built from five independent signals — syntax validity, back-translation alignment, sanity checks, cross-query agreement, and schema coverage — never just the model's own self-report.",
  },
];

const ICON_WRAP_CLASSES: Record<string, string> = {
  cyan: "border-cyan-glow/30 bg-cyan-glow/10 text-cyan-glow",
  violet: "border-violet-glow/30 bg-violet-glow/10 text-violet-glow",
  mint: "border-mint/30 bg-mint/10 text-mint",
  amber: "border-amber/30 bg-amber/10 text-amber",
  rose: "border-rose/30 bg-rose/10 text-rose",
};

const SAFETY_LAYERS = [
  { n: "01", title: "Prompt-level", body: "The system prompt forbids anything but SELECT statements — the first, cheapest line of defense, and the one most systems stop at." },
  { n: "02", title: "Guardrail middleware", body: "sqlparse-based checks block writes and DDL, cap subquery depth, enforce row limits, and estimate scan size via EXPLAIN — every rule independently configurable and every block logged for audit." },
  { n: "03", title: "Sandboxed execution", body: "A dedicated read-only database role plus a transaction that is always rolled back. If the first two layers ever miss something, this one still can't be bypassed." },
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
  };
}

export default function Landing() {
  return (
    <PageShell>
      {/* ---------- Hero ---------- */}
      <section className="relative mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24">
        <Blob className="-left-40 -top-40 h-[480px] w-[480px]" from="#2b52ff" to="#faf6ec" />
        <Blob className="-right-52 top-10 h-[420px] w-[420px]" from="#ff5a36" to="#faf6ec" />

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Badge tone="cyan" className="mb-6">
            <ShieldMark size={13} /> Natural-language SQL with production-grade safeguards
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Ask your data questions in
            <span className="text-gradient"> plain English.</span>
            <br />
            Get SQL you can verify.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-700 sm:text-lg">
            SafeSQL translates natural language into SQL against a real database, blocks destructive
            statements before they execute, sandboxes every query, cross-checks each result against an
            independent second query, and reports a transparent confidence score with every answer.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link to="/workspace">
              <Button className="text-[15px]">
                Launch the workspace <ArrowRight size={16} />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" className="text-[15px]">
                See how it works
              </Button>
            </a>
          </div>
        </motion.div>

        <motion.div {...fadeUp(0.15)} className="mt-16">
          <HeroPipeline className="mx-auto w-full max-w-4xl" />
        </motion.div>
      </section>

      {/* ---------- Stats strip ---------- */}
      <section className="border-y-2 border-ink-950 bg-paper-100">
        <div className="mx-auto max-w-7xl px-6 pt-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            From the bundled evaluation suite — 42 golden questions, 8 adversarial SQL attempts
          </p>
        </div>
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 pb-10 pt-4 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div key={s.label} {...fadeUp(i * 0.06)} className="text-center sm:text-left">
              <div className="font-display text-3xl font-bold text-slate-950">{s.value}</div>
              <div className="mt-1 text-xs text-slate-500">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- Feature grid ---------- */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div {...fadeUp()} className="mx-auto mb-14 max-w-2xl text-center">
          <Badge tone="violet">Engineered for production use</Badge>
          <h2 className="mt-4 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
            Six independent systems, one reliable answer
          </h2>
          <p className="mt-3 text-slate-600">
            Every layer below executes on every query, not only the ones you'd expect to fail.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} {...fadeUp((i % 3) * 0.08)}>
              <Card className="h-full transition-transform duration-300 hover:-translate-y-1">
                <div className={`mb-4 inline-flex rounded-xl border p-2.5 ${ICON_WRAP_CLASSES[f.tone]}`}>
                  <f.icon size={20} />
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-950">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how-it-works" className="border-t-2 border-ink-950 bg-paper-100 py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <motion.div {...fadeUp()}>
            <Badge tone="cyan">
              <Sparkles size={12} /> Architecture
            </Badge>
            <h2 className="mt-4 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
              Seven checkpoints between question and answer
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              No question reaches the database directly. Each one passes through an ambiguity check,
              a schema-filtered prompt, guardrail middleware, and sandboxed execution, then three
              independent hallucination-detection signals before a confidence score is computed.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-glow" />
                Ambiguous terms trigger a clarification request instead of a silent guess.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                Guardrails evaluate the query before execution, not after — nothing unsafe ever touches the database.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                A second, independently-generated query cross-checks the first before either is trusted.
              </li>
              <li className="flex gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose" />
                Every step is logged, so a low-confidence answer can be traced back to the signal that flagged it.
              </li>
            </ul>
            <Link to="/workspace" className="mt-8 inline-block">
              <Button variant="outline">
                Try it live <ArrowRight size={15} />
              </Button>
            </Link>
          </motion.div>

          <motion.div {...fadeUp(0.15)}>
            <Card className="p-4">
              <ArchitectureFlow className="mx-auto w-full max-w-sm" />
            </Card>
          </motion.div>
        </div>
      </section>

      {/* ---------- Safety layers ---------- */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <motion.div {...fadeUp()} className="mx-auto mb-14 max-w-2xl text-center">
          <Badge tone="mint">
            <ShieldCheck size={12} /> Defense in depth
          </Badge>
          <h2 className="mt-4 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
            Lead with safety, not accuracy
          </h2>
          <p className="mt-3 text-slate-600">
            A wrong-but-cautious answer is recoverable. An unsafe query that mutates data is not.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {SAFETY_LAYERS.map((l, i) => (
            <motion.div key={l.n} {...fadeUp(i * 0.1)}>
              <Card className="h-full">
                <span className="font-mono text-xs text-slate-400">{l.n}</span>
                <h3 className="mt-2 font-display text-lg font-semibold text-slate-950">{l.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{l.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- Domain teaser ---------- */}
      <section className="border-t-2 border-ink-950 bg-paper-100 py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <motion.div {...fadeUp()}>
            <Card>
              <div className="flex items-center gap-2 text-slate-600">
                <Database size={16} className="text-cyan-glow" />
                <span className="text-xs uppercase tracking-wide">Sample domain</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["customers", "categories", "products", "orders", "order_items", "reviews"].map((t) => (
                  <span
                    key={t}
                    className="rounded-lg border-2 border-ink-950 bg-ink-950 px-3 py-1.5 font-mono text-xs text-mist-100"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                ~500 customers · 200 products · 2,000 orders · 6,000 line items · 1,500 reviews —
                deterministically seeded, real joins and aggregations included.
              </p>
            </Card>
          </motion.div>
          <motion.div {...fadeUp(0.15)}>
            <h2 className="font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
              An e-commerce analytics database, ready to explore
            </h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Ask about top-selling products, revenue by month, customers who never ordered, average
              ratings by category — or browse the schema visually before you ask anything at all. Real
              foreign keys, real ambiguity, and enough volume that aggregations mean something.
            </p>
            <Link to="/schema" className="mt-8 inline-block">
              <Button variant="outline">
                Explore the schema <ArrowRight size={15} />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="relative mx-auto max-w-5xl px-6 py-24 text-center">
        <Blob className="left-1/2 top-0 h-[380px] w-[380px] -translate-x-1/2" from="#c6ff3b" to="#faf6ec" />
        <motion.div {...fadeUp()}>
          <h2 className="font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
            See the full pipeline on your first query
          </h2>
          <p className="mx-auto mt-4 max-w-md text-slate-600">
            The bundled smoke-test provider requires no API key to try — every guardrail and
            confidence signal runs identically with or without a live model configured.
          </p>
          <Link to="/workspace" className="mt-8 inline-block">
            <Button className="text-[15px]">
              Open the workspace <ArrowRight size={16} />
            </Button>
          </Link>
        </motion.div>
      </section>
    </PageShell>
  );
}
