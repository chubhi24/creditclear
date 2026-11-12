import { SourceStatus } from "../../design/Card";
import { LENDER_SPREAD_PCT, rupees } from "../../lib/options";

function Metric({ label, value, note, source }) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:py-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="font-display text-2xl text-ink">{value}</span>
      <span className="text-xs leading-relaxed text-ink-muted">{note}</span>
      {source ? (
        <span className="mt-1">
          <SourceStatus source={source} />
        </span>
      ) : null}
    </div>
  );
}

/** Shows the crawled data that will feed the assessment. */
export function LiveMarketPanel({ market, operatorLabel, compact = false }) {
  const { data, loading, error } = market;

  if (loading && !data) {
    return (
      <div className="grid gap-6 sm:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-3 w-24 animate-pulse rounded-full bg-line" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-line" />
            <div className="h-3 w-32 animate-pulse rounded-full bg-line" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-ink-muted">{error || "Live data is unavailable."} We’ll use dated snapshots instead.</p>;
  }

  const [planSource, repoSource, inflationSource] = data.sources;
  const plan = data.cheapestPlan;

  return (
    <div
      className={`grid divide-y divide-line transition-opacity duration-300 sm:grid-cols-3 sm:gap-8 sm:divide-y-0 ${loading ? "opacity-50" : ""}`}
    >
      <Metric
        label={`Cheapest ${operatorLabel} plan`}
        value={`${rupees(plan.monthlyCost)}/mo`}
        note={compact ? `${rupees(plan.price)} for ${plan.validityDays} days` : `${rupees(plan.price)} for ${plan.validityDays} days · ${data.planCount} plans checked`}
        source={planSource}
      />
      <Metric
        label="Loan rate"
        value={`${(data.repoRatePct + LENDER_SPREAD_PCT).toFixed(1)}%`}
        note={`RBI repo ${data.repoRatePct}% + ${LENDER_SPREAD_PCT}% lender spread`}
        source={repoSource}
      />
      <Metric
        label={`Inflation · ${data.inflation.region}`}
        value={`${data.inflation.rate}%`}
        note={`CPI, ${data.inflation.period}`}
        source={inflationSource}
      />
    </div>
  );
}
