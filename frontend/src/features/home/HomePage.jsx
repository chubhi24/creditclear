import { useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../design/Button";
import { Card, Eyebrow } from "../../design/Card";
import { useReveal } from "../../lib/motion";
import { LiveMarketPanel } from "../market/LiveMarketPanel";
import { useMarket } from "../market/useMarket";

const STEPS = [
  {
    n: "01",
    title: "Tell us what you already pay",
    body: "Rent, utility bills, mobile recharges and income. No bureau file, no documents to upload today.",
  },
  {
    n: "02",
    title: "We check it against live data",
    body: "Your operator’s current plans, the RBI repo rate and your state’s inflation are fetched as you apply.",
  },
  {
    n: "03",
    title: "See your score and what moved it",
    body: "Every factor is shown with its exact point impact, plus what to change to raise it.",
  },
];

const SIGNALS = [
  ["Rent", "On-time rate and how long you’ve paid it"],
  ["Utilities", "Electricity and water bills, paid on time"],
  ["Mobile", "Recharge spend against the cheapest live plan"],
  ["Living costs", "Food, transport, medical, education and EMIs against income, adjusted for local inflation"],
  ["Loan history", "New borrowers start lower; a repaid loan lifts the score"],
];

export function HomePage() {
  const scope = useRef(null);
  const market = useMarket("jio", "99");
  useReveal(scope);

  return (
    <div ref={scope} className="space-y-28 md:space-y-36">
      <section className="max-w-3xl pt-4">
        <div data-reveal>
          <Eyebrow>Alternative credit scoring</Eyebrow>
        </div>
        <h1 data-reveal className="font-display mt-6 text-5xl leading-[1.05] text-ink md:text-7xl">
          Credit that reads the history you already have.
        </h1>
        <p data-reveal className="mt-8 max-w-xl text-lg leading-relaxed text-ink-muted">
          CreditClear scores thin-file borrowers from rent, bills and mobile recharges, checked against live market data,
          and explains every point.
        </p>
        <div data-reveal className="mt-10 flex flex-wrap items-center gap-6">
          <Link to="/apply">
            <Button>Check my eligibility</Button>
          </Link>
          <Link to="/explainability" className="text-sm text-sage hover:text-sage-deep">
            How the score works →
          </Link>
        </div>
      </section>

      <section data-reveal>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Live market context</Eyebrow>
            <h2 className="mt-3 text-2xl font-medium tracking-tight text-ink">What the assessment sees today</h2>
          </div>
          <p className="max-w-sm text-sm text-ink-muted">Sample shown for Jio, all India. Your own operator and state are used when you apply.</p>
        </div>
        <Card className="mt-8">
          <LiveMarketPanel market={market} operatorLabel="Jio" />
        </Card>
      </section>

      <section>
        <div data-reveal>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-2xl font-medium tracking-tight text-ink">Three calm steps, about four minutes</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} data-reveal className="h-full">
              <span className="text-xs tabular-nums text-ink-faint">{step.n}</span>
              <h3 className="mt-6 text-lg font-medium text-ink">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:gap-20">
        <div data-reveal>
          <Eyebrow>What we read</Eyebrow>
          <h2 className="mt-3 text-2xl font-medium tracking-tight text-ink">Signals, not paperwork</h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            A logistic regression weighs each signal, and every factor’s exact impact is shown. Nothing is a black box.
          </p>
        </div>
        <dl data-reveal className="divide-y divide-line border-y border-line">
          {SIGNALS.map(([term, detail]) => (
            <div key={term} className="grid gap-1 py-5 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm font-medium text-ink">{term}</dt>
              <dd className="text-sm text-ink-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section data-reveal className="rounded-[var(--radius-soft)] border border-line bg-surface px-8 py-16 text-center md:py-20">
        <h2 className="font-display mx-auto max-w-xl text-4xl leading-tight text-ink md:text-5xl">
          A plan instead of a closed door.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-ink-muted">
          If you’re not eligible yet, you’ll see exactly which factors to work on and the score each change would unlock.
        </p>
        <Link to="/apply" className="mt-10 inline-block">
          <Button>Start my application</Button>
        </Link>
      </section>
    </div>
  );
}
