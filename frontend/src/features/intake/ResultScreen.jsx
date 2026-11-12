import { useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../design/Button";
import { Badge, Card, Eyebrow, SourceStatus } from "../../design/Card";
import { Gauge } from "../../design/Gauge";
import { useReveal } from "../../lib/motion";
import { EMPLOYMENT, LOAN_HISTORY, OPERATORS, STATES, labelFor, rupees } from "../../lib/options";

function Points({ points }) {
  if (!points) return <span className="text-xs tabular-nums text-ink-faint">±0</span>;
  return (
    <span className={`text-xs font-medium tabular-nums ${points > 0 ? "text-sage-deep" : "text-ink"}`}>
      {points > 0 ? `+${points}` : `−${Math.abs(points)}`} pts
    </span>
  );
}

function Check({ passed }) {
  return passed ? (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage-tint text-sage-deep">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
        <path d="M4 8.5 6.5 11 12 5" />
      </svg>
    </span>
  ) : (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-faint text-ink-muted">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-2.5 w-2.5">
        <path d="M4 8h8" />
      </svg>
    </span>
  );
}

function EmailNotice({ email }) {
  if (!email) return null;
  const sent = email.status === "sent";
  return (
    <p
      className={`mt-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm ${
        sent ? "bg-sage-tint text-sage-deep" : "bg-line text-ink-muted"
      }`}
      role="status"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${sent ? "bg-sage" : "bg-ink-faint"}`} />
      {sent
        ? `Your full report has been emailed to ${email.to}.`
        : email.status === "not-configured"
          ? "Email reports are not switched on for this server, so nothing was sent."
          : `We couldn’t email your report to ${email.to}. Everything is shown below.`}
    </p>
  );
}

export function ResultScreen({ result, onRestart }) {
  const scope = useRef(null);
  useReveal(scope, [result.applicationId]);
  const { eligibility, band } = result;
  const decision = eligibility.decision;
  const eligible = decision.id !== "not-yet";

  return (
    <div ref={scope} className="mx-auto max-w-3xl">
      <div data-reveal>
        <Eyebrow>Your result</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-tight text-ink md:text-5xl">{decision.label}</h1>
        <p className="mt-4 max-w-xl text-ink-muted">{decision.detail}</p>
        <EmailNotice email={result.email} />
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-[1fr_1.2fr]">
        <Card data-reveal className="flex flex-col items-center justify-center text-center">
          <Gauge score={result.score} band={band.id} />
          <div className="mt-5">
            <Badge tone={band.id === "clear" ? "sage" : "neutral"}>{band.label}</Badge>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">{band.detail}</p>
        </Card>

        <Card data-reveal>
          <p className="text-xs text-ink-muted">{eligible ? "You can borrow up to" : "Requested"}</p>
          <p className="font-display mt-2 text-4xl text-ink">
            {rupees(eligible ? eligibility.maxAmount : eligibility.requestedAmount)}
          </p>
          <dl className="mt-6 divide-y divide-line border-t border-line text-sm">
            {[
              ["Tenure", `${eligibility.tenureMonths} months`],
              ["Interest", `${eligibility.annualRatePct}% (repo ${eligibility.repoRatePct}% + ${eligibility.lenderSpreadPct}%)`],
              ["EMI on your request", `${rupees(eligibility.requestedEmi)}/mo`],
              ["Monthly repayment room", `${rupees(eligibility.monthlyCapacity)}/mo`],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 py-3">
                <dt className="text-ink-muted">{term}</dt>
                <dd className="text-right text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card data-reveal className="mt-5">
        <h2 className="text-lg font-medium text-ink">Eligibility checks</h2>
        <ul className="mt-5 space-y-4">
          {eligibility.checks.map((check) => (
            <li key={check.id} className="flex gap-3">
              <Check passed={check.passed} />
              <div>
                <p className="text-sm font-medium text-ink">{check.label}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card data-reveal className="mt-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium text-ink">What moved your score</h2>
          <Link to="/explainability" className="text-sm text-sage hover:text-sage-deep">
            Full breakdown →
          </Link>
        </div>
        <ul className="mt-5 divide-y divide-line">
          {result.topFactors.map((factor) => (
            <li key={factor.key} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium text-ink">{factor.label}</p>
                <Points points={factor.points} />
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{factor.message}</p>
              {factor.improve ? (
                <p className="mt-2 text-sm text-ink">
                  {factor.improve}
                  {factor.projectedScore ? (
                    <span className="text-ink-muted"> Projected score: {factor.projectedScore}.</span>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card data-reveal className="mt-5">
        <h2 className="text-lg font-medium text-ink">Data used for this decision</h2>
        <ul className="mt-5 space-y-3">
          {result.sources.map((source) => (
            <li key={source.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <a href={source.url} target="_blank" rel="noreferrer" className="text-sm text-ink hover:text-sage-deep">
                {source.label}
              </a>
              <SourceStatus source={source} />
            </li>
          ))}
        </ul>
        {result.sources.some((s) => s.note) ? (
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">{result.sources.find((s) => s.note).note}</p>
        ) : null}
      </Card>

      <div data-reveal className="mt-10 flex flex-wrap gap-3">
        <Link to="/plan">
          <Button>{eligible ? "See how to borrow more" : "See my improvement plan"}</Button>
        </Link>
        <Button variant="secondary" onClick={onRestart}>
          Start a new application
        </Button>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        {result.scoringMethod === "logistic-regression"
          ? `Scored by a logistic regression (${result.modelVersion}) trained on simulated repayment data. Demonstration only, not a lending decision.`
          : `Scored by the rule formula (${result.modelVersion}).`}{" "}
        Application {result.applicationId}.
      </p>
    </div>
  );
}

export function LoadingScore() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-sage" />
      <p className="font-display mt-8 text-2xl text-ink">Checking live data</p>
      <p className="mt-3 text-sm text-ink-muted">Fetching your operator’s plans, the RBI repo rate and your state’s inflation.</p>
    </div>
  );
}

export function ScoreError({ message, onRetry, onBack }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="font-display text-3xl text-ink">We couldn’t finish scoring</h1>
      <p className="mt-4 text-ink-muted">{message}</p>
      <div className="mt-8 flex gap-3">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="secondary" onClick={onBack}>
          Back to review
        </Button>
      </div>
    </div>
  );
}

export function ReviewList({ values }) {
  const rows = [
    ["Name", values.name],
    ["Email for your report", values.email],
    ["State", labelFor(STATES, values.stateCode)],
    ["Employment", labelFor(EMPLOYMENT, values.employmentType)],
    ["Loan history", labelFor(LOAN_HISTORY, values.loanHistory)],
    ["Monthly income", rupees(values.monthlyIncome)],
    ["Rent", `${rupees(values.monthlyRent)}/mo · ${values.rentOnTimePct}% on time · ${values.rentMonths} months`],
    [
      "Bills",
      `Electricity ${rupees(values.monthlyElectricity)} · water and gas ${rupees(values.monthlyWaterGas)} · ${values.utilityOnTimePct}% on time · ${values.utilityMonths} months`,
    ],
    [
      "Living costs",
      `Food ${rupees(values.monthlyFood)} · transport ${rupees(values.monthlyTransport)} · medical ${rupees(values.monthlyMedical)} · education ${rupees(values.monthlyEducation)}`,
    ],
    ["Existing EMIs", `${rupees(values.existingEmi)}/mo`],
    ["Mobile", `${labelFor(OPERATORS, values.operator)} · ${rupees(values.monthlyRechargeSpend)}/mo · ${values.rechargeFrequency}× a month`],
    ["Loan", `${rupees(values.loanAmount)} over ${values.loanTenureMonths} months`],
  ];
  return (
    <div>
      <h2 className="text-lg font-medium text-ink">Check your answers</h2>
      <dl className="mt-5 divide-y divide-line border-y border-line">
        {rows.map(([term, value]) => (
          <div key={term} className="grid gap-1 py-3 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-ink-muted">{term}</dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
