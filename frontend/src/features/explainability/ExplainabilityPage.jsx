import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Eyebrow } from "../../design/Card";
import { useReveal } from "../../lib/motion";
import { SAMPLE_RESULT, loadResult } from "../../lib/resultStore";
import { SampleBanner, SampleFooterCta } from "../sample/SampleBanner";

const MODEL = [
  ["Loan repayment history", "Separate weights for new borrowers and for missed payments; a repaid loan is the best case"],
  ["Rent and bill on-time records", "Rates under 12 months of history are pulled toward neutral, so one perfect month counts less than a year"],
  ["Essentials against income", "Rent, food, transport, bills, recharge, medical, education and EMIs, inflated by your state’s live CPI"],
  ["Employment", "Ordered from not employed to salaried"],
  ["Recharge capability", "Your recharge spend ÷ the cheapest live plan from your operator"],
  ["History length", "Months of rent and of bill payments"],
];

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 text-xs">
      <p className="font-medium text-ink">{d.label}</p>
      <p className="mt-1 text-ink-muted">
        {d.value} · {d.points > 0 ? "+" : ""}
        {d.points} pts
      </p>
    </div>
  );
}

export function ExplainabilityPage() {
  const scope = useRef(null);
  const own = loadResult();
  const result = own ?? SAMPLE_RESULT;
  const isSample = !own;
  useReveal(scope);
  const rows = result.contributions;
  const whose = isSample ? `${result.applicantName}’s` : "Your";

  return (
    <div ref={scope} className="mx-auto max-w-3xl">
      <div data-reveal>
        <Eyebrow>Explainability</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-tight text-ink md:text-5xl">Every point, accounted for</h1>
        <p className="mt-5 max-w-xl text-ink-muted">
          The score comes from a logistic regression. Because the model is additive, each factor’s impact is exact, not
          an approximation. Impacts are measured against the average applicant.
        </p>
      </div>

      {isSample ? <SampleBanner name={result.applicantName} score={result.score} what="breakdown" /> : null}

      <Card data-reveal className={isSample ? "mt-8" : "mt-12"}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium text-ink">
            {whose} score of {result.score}
          </h2>
          <span className="text-xs text-ink-muted">points each factor added or removed</span>
        </div>
        <div className="mt-6" style={{ height: rows.length * 40 + 24 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#ECE9E2" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#9A9A9A", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={190}
                tick={{ fill: "#5C5C5C", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine x={0} stroke="#9A9A9A" />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(17,17,17,0.03)" }} />
              <Bar dataKey="points" radius={6} barSize={14} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.key} fill={row.points >= 0 ? "#6B8F71" : "#5C5C5C"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex gap-5 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sage" /> Helped
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink-muted" /> Held back
          </span>
        </div>
      </Card>

      <Card data-reveal className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="pb-3 pr-4 font-medium">Factor</th>
              <th className="pb-3 pr-4 font-medium">{isSample ? `${result.applicantName}’s value` : "Your value"}</th>
              <th className="pb-3 pr-4 text-right font-medium">Impact</th>
              <th className="pb-3 text-right font-medium">If improved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-3 pr-4 text-ink">{row.label}</td>
                <td className="py-3 pr-4 text-ink-muted">{row.value}</td>
                <td className={`py-3 pr-4 text-right tabular-nums ${row.points > 0 ? "text-sage-deep" : "text-ink"}`}>
                  {row.points > 0 ? `+${row.points}` : row.points}
                </td>
                <td className="py-3 text-right tabular-nums text-ink-muted">{row.projectedScore ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section data-reveal className="mt-16">
        <h2 className="text-lg font-medium text-ink">The model</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Default risk = 1 ÷ (1 + e<sup>−z</sup>), where z = intercept + Σ weight × (input − average) ÷ spread. Weights were
          learned from 36,000 simulated applicants and must point in the safe direction, so better behaviour can never
          lower a score. Score 70 corresponds to a 10% default risk and score 50 to 25%.
        </p>
        <p className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-ink-muted">
          Trained on simulated repayment outcomes. This demonstrates the pipeline; it must be retrained on real loan
          outcomes before any lending decision.
        </p>
        <dl className="mt-6 divide-y divide-line border-y border-line">
          {MODEL.map(([term, detail]) => (
            <div key={term} className="grid gap-1 py-3 text-sm sm:grid-cols-[14rem_1fr]">
              <dt className="text-ink">{term}</dt>
              <dd className="text-ink-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      {isSample ? <SampleFooterCta line="See which factors move your own score." /> : null}
    </div>
  );
}
