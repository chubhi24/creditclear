/**
 * Rule-based scoring formula, used as the fallback when the trained model cannot run.
 * Logistic-style: score = round(100 / (1 + e^(-z)))
 * z = intercept + categorical weights + sum(coef × standardized value × confidence).
 * Higher score = lower risk. Every term is reported back with its point impact,
 * so explanations are exact rather than approximated.
 *
 * Changes in v2:
 * - New borrowers (no loan history) start lower; a repaid loan lifts the score.
 * - On-time rates are weighted by history length, so one perfect month counts less than a year.
 * - Recharge capability and income buffer come from live market data (see eligibility.js).
 * - Age is no longer scored (fair-lending review).
 */

const MODEL_VERSION = "formula-2.1.0";
const INTERCEPT = 0.35;

const CATEGORICAL = [
  {
    key: "loanHistory",
    label: "Loan repayment history",
    weights: { none: -0.35, repaid: 0.3, missed: -0.6 },
    names: { none: "No loans yet", repaid: "Repaid on time", missed: "Missed payments" },
    messages: {
      none: {
        message: "You have no loan history yet, so there is no repayment record to rely on. New borrowers start lower.",
        improve: "Start small: repay a low-value loan or credit-builder product on time for 6 months.",
        target: "repaid",
      },
      repaid: { message: "A loan repaid on time is the strongest proof that you can handle credit." },
      missed: {
        message: "Missed payments on an earlier loan weigh heavily on the score.",
        improve: "Clear any overdue amount and keep 6 months of on-time payments before re-applying.",
        target: "repaid",
      },
    },
  },
  {
    key: "employmentType",
    label: "Employment",
    weights: { salaried: 0.28, "self-employed": 0.1, informal: 0, unemployed: -0.35 },
    names: { salaried: "Salaried", "self-employed": "Self-employed", informal: "Informal / gig", unemployed: "Not employed" },
    messages: {
      salaried: { message: "A regular salary gives lenders predictable income to plan around." },
      "self-employed": { message: "Self-employment income counts, with a little more variability priced in." },
      informal: { message: "Informal work is scored neutrally; your payment record carries the weight." },
      unemployed: {
        message: "Without current income, any repayment is harder to plan.",
        improve: "Document any regular income, even part-time or gig work, before re-applying.",
      },
    },
  },
];

const NUMERIC = [
  {
    key: "rentOnTimePct",
    mean: 70,
    scale: 20,
    coef: 0.3,
    confidenceFrom: "rentMonths",
    label: "Rent on-time rate",
    format: (v) => `${v}%`,
    positive: "Consistent rent payments are one of the strongest signals in this model.",
    negative: "Missed or late rent payments weighed against the score.",
    improve: "Treat the rent due-date as non-negotiable; 3–6 more on-time months move the score.",
    target: (v) => Math.max(v, 95),
  },
  {
    key: "utilityOnTimePct",
    mean: 70,
    scale: 20,
    coef: 0.27,
    confidenceFrom: "utilityMonths",
    label: "Utility bill on-time rate",
    format: (v) => `${v}%`,
    positive: "You pay utility bills on time more often than typical thin-file applicants.",
    negative: "Utility bills have been paid late more often than we’d like to see.",
    improve: "Set reminders or autopay for electricity and water so on-time % climbs above 95%.",
    target: (v) => Math.max(v, 95),
  },
  {
    key: "rentMonths",
    mean: 12,
    scale: 12,
    coef: 0.2,
    label: "Rent history length",
    format: (v) => `${v} months`,
    positive: "You have a meaningful track record of paying housing costs.",
    negative: "Rent history is brief, so the model cannot yet reward stability.",
    improve: "Stay in a documented rental and keep receipts or bank transfers for 12 more months.",
    target: (v) => Math.min(60, v + 12),
  },
  {
    key: "utilityMonths",
    mean: 12,
    scale: 12,
    coef: 0.17,
    label: "Utility history length",
    format: (v) => `${v} months`,
    positive: "A longer utility history gives lenders more signal to work with.",
    negative: "Utility history is still short, so there is less evidence of consistency.",
    improve: "Keep the same utility account active and documented for 12 more months.",
    target: (v) => Math.min(60, v + 12),
  },
  {
    key: "incomeBuffer",
    mean: 0.25,
    scale: 0.2,
    coef: 0.22,
    min: -1,
    max: 1,
    label: "Income left after essentials",
    format: (v) => `${Math.round(v * 100)}% of income`,
    positive: "After all essentials (adjusted for local inflation) you keep a healthy share of income.",
    negative: "Essentials take most of your income, leaving little room for a repayment.",
    improve: "Lower a fixed cost or document extra income so at least a quarter of income is left after essentials.",
    target: (v) => Math.max(v, 0.25),
  },
  {
    key: "rechargeCoverage",
    mean: 1.5,
    scale: 0.75,
    coef: 0.15,
    min: 0,
    max: 4,
    label: "Recharge capability",
    format: (v) => `${v.toFixed(1)}× the cheapest live plan`,
    positive: "Your recharge spend comfortably covers the cheapest current plan from your operator.",
    negative: "Your recharge spend is close to, or below, the cheapest current plan from your operator.",
    improve: "Keep at least the cheapest monthly plan active without gaps; it shows steady cash flow.",
    target: (v) => Math.max(v, 1.5),
  },
  {
    // Centred on one recharge a month (a 28-day plan); extra small top-ups earn little more.
    key: "rechargeFrequency",
    mean: 1,
    scale: 0.5,
    coef: 0.1,
    max: 2,
    label: "Mobile recharge regularity",
    format: (v) => `${v} per month`,
    positive: "Regular mobile recharges suggest steady cash flow.",
    negative: "Irregular or infrequent recharges reduced confidence in cash-flow stability.",
    improve: "Recharge on a steady monthly cadence rather than long gaps followed by catch-up.",
    target: (v) => Math.max(v, 1),
  },
];

const clamp = (v, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v));
const toScore = (z) => clamp(Math.round(100 / (1 + Math.exp(-z))), 1, 99);

function numericContribution(feature, ctx) {
  const value = clamp(Number(ctx[feature.key]), feature.min, feature.max);
  const confidence = feature.confidenceFrom ? Math.min(1, ctx[feature.confidenceFrom] / 12) : 1;
  return feature.coef * ((value - feature.mean) / feature.scale) * confidence;
}

function categoricalContribution(term, ctx) {
  return term.weights[ctx[term.key]] ?? 0;
}

function totalZ(ctx) {
  let z = INTERCEPT;
  for (const term of CATEGORICAL) z += categoricalContribution(term, ctx);
  for (const feature of NUMERIC) z += numericContribution(feature, ctx);
  return z;
}

function bandFor(score) {
  if (score >= 70) {
    return { id: "clear", label: "Clear", detail: "Your alternative data supports extending a small line of credit." };
  }
  if (score >= 50) {
    return {
      id: "borderline",
      label: "Borderline",
      detail: "There is a path to approval with a few more months of clean payments.",
    };
  }
  return {
    id: "improve",
    label: "Room to improve",
    detail: "Not a rejection of you — the file is still thin. The plan below is how to strengthen it.",
  };
}

/**
 * @param input validated application
 * @param signals market-derived signals from eligibility.deriveSignals
 */
function computeScore(input, signals) {
  const ctx = { ...input, ...signals };
  const z = totalZ(ctx);
  const score = toScore(z);
  const pointsFor = (c) => Math.round(100 / (1 + Math.exp(-z)) - 100 / (1 + Math.exp(-(z - c))));
  const projected = (overrides) => toScore(totalZ({ ...ctx, ...overrides }));

  const terms = [
    ...CATEGORICAL.map((term) => {
      const choice = ctx[term.key];
      const copy = term.messages[choice] ?? {};
      const contribution = categoricalContribution(term, ctx);
      return {
        key: term.key,
        label: term.label,
        value: term.names[choice] ?? choice,
        contribution,
        message: copy.message,
        improve: copy.improve,
        projectedScore: copy.target ? projected({ [term.key]: copy.target }) : undefined,
      };
    }),
    ...NUMERIC.map((feature) => {
      const value = Number(ctx[feature.key]);
      const contribution = numericContribution(feature, ctx);
      const target = feature.target(value);
      return {
        key: feature.key,
        label: feature.label,
        value: feature.format(value),
        contribution,
        message: contribution >= 0 ? feature.positive : feature.negative,
        improve: contribution < 0 ? feature.improve : undefined,
        projectedScore: contribution < 0 && target !== value ? projected({ [feature.key]: target }) : undefined,
      };
    }),
  ].map((term) => ({
    ...term,
    contribution: Number(term.contribution.toFixed(4)),
    points: pointsFor(term.contribution),
    direction: Math.abs(term.contribution) < 0.01 ? "neutral" : term.contribution > 0 ? "helped" : "held-back",
  }));

  const ranked = [...terms].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    modelVersion: MODEL_VERSION,
    score,
    probability: Number((1 / (1 + Math.exp(-z))).toFixed(4)),
    band: bandFor(score),
    topFactors: ranked.filter((t) => t.direction !== "neutral").slice(0, 3),
    contributions: ranked,
  };
}

module.exports = { computeFormulaScore: computeScore, bandFor, toScore, MODEL_VERSION };
