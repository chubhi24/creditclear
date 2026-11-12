import { useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../design/Button";
import { Card, Eyebrow } from "../../design/Card";
import { useReveal } from "../../lib/motion";
import { rupees } from "../../lib/options";
import { SAMPLE_RESULT, loadResult } from "../../lib/resultStore";
import { SampleBanner, SampleFooterCta } from "../sample/SampleBanner";

// Used only when the API didn't return a plan (the rule-formula fallback).
const GENERIC_TIMELINE = [
  { title: "Month 1", body: "Move every recurring bill to autopay. Keep rent and bill receipts in one folder." },
  { title: "Month 2", body: "Stay 100% on time. Keep the same mobile number and plan active." },
  { title: "Month 3", body: "Re-apply with the same details. A longer, cleaner trail is rewarded." },
];

const BAND_LABEL = { clear: "Clear", borderline: "Borderline", improve: "Room to improve" };
const monthLabel = (m) => `By month ${m}`;

function planTimeline(plan) {
  const start = {
    title: "Now",
    body: `Start: ${plan.steps.map((s) => s.action.charAt(0).toLowerCase() + s.action.slice(1)).join("; ")}.`,
    score: plan.currentScore,
    band: null,
  };
  const checkpoints = plan.milestones.map((m) => ({
    title: monthLabel(m.month),
    body: `Re-apply now: the improved ${m.completes.map((c) => c.toLowerCase()).join(" and ")} ${m.completes.length > 1 ? "count" : "counts"} in your score.`,
    score: m.expectedScore,
    band: m.band,
  }));
  return [start, ...checkpoints];
}

function PathSummary({ plan, who }) {
  const last = plan.milestones.at(-1);
  if (!plan.steps.length) return null;
  const heading = plan.goal
    ? plan.reachesGoal
      ? `Reach ${plan.goal.label} by month ${last.month}`
      : `Get closer to ${plan.goal.label} by month ${last.month}`
    : `Strengthen your offer by month ${last.month}`;
  return (
    <Card data-reveal className="mt-12">
      <Eyebrow>{who ? `${who}’s path` : "Your path"}</Eyebrow>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <h2 className="text-2xl font-medium tracking-tight text-ink">{heading}</h2>
        <p className="flex items-baseline gap-3 tabular-nums">
          <span className="text-3xl text-ink-muted">{plan.currentScore}</span>
          <span className="text-ink-faint">→</span>
          <span className="font-display text-5xl text-sage-deep">{plan.finalScore}</span>
        </p>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        {plan.goal && !plan.reachesGoal
          ? `Even with every step that helps, the model expects ${plan.finalScore}, short of ${plan.goal.score}. Keep going after this and re-apply.`
          : `${plan.steps.length === 1 ? "This step" : `These ${plan.steps.length} steps`}, done at the same time, should take ${who ? `${who}’s` : "your"} score to about ${plan.finalScore}.`}
      </p>
      <ol className="mt-6 divide-y divide-line border-y border-line">
        {plan.steps.map((s) => (
          <li key={s.key} className="flex items-baseline justify-between gap-4 py-3 text-sm">
            <span className="text-ink">{s.action}</span>
            <span className="shrink-0 text-xs text-ink-muted">
              {s.months} {s.months === 1 ? "month" : "months"}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function PlanPage() {
  const scope = useRef(null);
  const own = loadResult();
  const result = own ?? SAMPLE_RESULT;
  const isSample = !own;
  useReveal(scope);

  const plan = result.plan;
  const inPlan = new Set(plan?.steps.map((s) => s.key));
  const steps = result.contributions
    .filter((c) => c.improve)
    .sort((a, b) => Number(inPlan.has(b.key)) - Number(inPlan.has(a.key)) || (b.projectedScore ?? 0) - (a.projectedScore ?? 0));
  const timeline = plan?.steps.length ? planTimeline(plan) : GENERIC_TIMELINE;

  return (
    <div ref={scope} className="mx-auto max-w-3xl">
      <div data-reveal>
        <Eyebrow>{isSample ? "Plan preview" : "Your plan"}</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-tight text-ink md:text-5xl">A plan instead of a closed door</h1>
        <p className="mt-5 max-w-xl text-ink-muted">
          {isSample
            ? "Every plan is built from the applicant’s own answers: the factors that held the score back, what to change, and the score each change unlocks."
            : `Your score is ${result.score}. The plan below is built from your own answers: the factors that held it back, what to change, and the score each change unlocks.`}
        </p>
        {!isSample && result.eligibility.decision.id !== "eligible" ? (
          <p className="mt-3 text-sm text-ink">
            {result.eligibility.maxAmount > 0
              ? `Today you can borrow up to ${rupees(result.eligibility.maxAmount)} of the ${rupees(result.eligibility.requestedAmount)} you asked for.`
              : `You can’t borrow the ${rupees(result.eligibility.requestedAmount)} you asked for yet. The path below shows how to get there.`}
          </p>
        ) : null}
      </div>

      {isSample ? <SampleBanner name={result.applicantName} score={result.score} what="plan" /> : null}

      {plan ? <PathSummary plan={plan} who={isSample ? result.applicantName : null} /> : null}

      <section className="mt-16">
        <h2 data-reveal className="text-lg font-medium text-ink">
          {isSample ? `Every factor ${result.applicantName} can improve` : "Every factor you can improve"}
        </h2>
        <ol className="mt-6 space-y-4">
          {steps.map((step, index) => (
            <Card key={step.key} data-reveal className="flex gap-5">
              <span className="text-xs tabular-nums text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-medium text-ink">
                    {step.label}
                    {inPlan.has(step.key) ? (
                      <span className="ml-2 align-middle text-xs font-normal text-sage-deep">in the plan</span>
                    ) : null}
                  </h3>
                  {step.projectedScore ? (
                    <span className="shrink-0 rounded-full bg-sage-tint px-2.5 py-1 text-xs font-medium text-sage-deep">
                      → {step.projectedScore}
                    </span>
                  ) : null}
                </div>
                {step.value ? <p className="mt-1 text-xs text-ink-faint">Now: {step.value}</p> : null}
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.improve}</p>
              </div>
            </Card>
          ))}
          {!steps.length ? (
            <Card data-reveal>
              <p className="text-sm text-ink-muted">No factor is holding your score back. Keep your payments on time to stay here.</p>
            </Card>
          ) : null}
        </ol>
        {steps.length ? (
          <p data-reveal className="mt-4 text-xs text-ink-faint">
            Each “→” score is that change on its own. The path above combines them.
          </p>
        ) : null}
      </section>

      <section data-reveal className="mt-16">
        <h2 className="text-lg font-medium text-ink">
          {plan?.steps.length ? (isSample ? `${result.applicantName}’s timeline` : "Your timeline") : "The next 90 days"}
        </h2>
        <ol className="mt-6 border-l border-line">
          {timeline.map((item) => (
            <li key={item.title} className="relative pb-8 pl-8 last:pb-0">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-ink-faint bg-paper" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="text-sm font-medium text-ink">{item.title}</p>
                {item.score != null ? (
                  <p className="text-xs tabular-nums text-ink-muted">
                    {item.band ? "Expected score " : "Score today "}
                    <span className="font-medium text-ink">{item.score}</span>
                    {item.band ? ` · ${BAND_LABEL[item.band]}` : ""}
                  </p>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {isSample ? (
        <SampleFooterCta line="Get a plan built from your own numbers." />
      ) : (
        <div data-reveal className="mt-14">
          <Link to="/apply">
            <Button>Re-apply</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
