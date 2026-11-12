/**
 * Credit score from the trained logistic regression, with the rule formula as a fallback.
 * The score logit is linear in the inputs, so each term's point impact is exact.
 * Impacts are measured against the average applicant in the training data.
 */

const { bandFor, computeFormulaScore, toScore } = require("./scoringFormula");

let riskModel = null;
try {
  riskModel = require("./riskModel");
} catch (err) {
  console.log(JSON.stringify({ level: "WARN", event: "model.load_failed", message: err.message }));
}

const EMPLOYMENT_NAMES = {
  salaried: "Salaried",
  "self-employed": "Self-employed",
  informal: "Informal / gig",
  unemployed: "Not employed",
};

const OPERATOR_NAMES = { jio: "Jio", airtel: "Airtel", vi: "Vi", bsnl: "BSNL" };

const LOAN_COPY = {
  none: {
    value: "No loans yet",
    message: "You have no loan history yet, so there is no repayment record to rely on. New borrowers start lower.",
    improve: "You have no loan record yet. Take a small loan or credit-builder product and repay every instalment on time for 6 months.",
    action: "Take a small credit-builder loan and set its EMI to autopay",
  },
  repaid: {
    value: "Repaid on time",
    message: "A loan repaid on time is the strongest proof that you can handle credit.",
  },
  missed: {
    value: "Missed payments",
    message: "Missed payments on an earlier loan weigh heavily on the score.",
    improve: "Your earlier loan has missed payments. Clear the overdue amount, then make 6 months of on-time payments so the record shows it was repaid.",
    action: "Clear the overdue amount on your earlier loan",
  },
};

const EMPLOYMENT_IMPROVE = {
  "self-employed": "Your income is self-employed. GST filings or 6 months of bank statements showing regular deposits make it count as steadier.",
  informal: "Your income is informal or gig work. Bank statements or platform payouts showing regular monthly deposits make it count as steadier.",
  unemployed: "There is no regular income yet. Re-apply once you have a steady source, even part-time, with deposits you can show.",
  salaried: "Keep salary credits going into the same bank account.",
};

const months = (n) => `${n} ${n === 1 ? "month" : "months"}`;
const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Months of on-time payments assumed by each record-building step.
const RECORD_MONTHS = 6;
const HISTORY_MONTHS = 12;

// k more on-time months: the rate is averaged over the longer record, which the model caps at 60 months.
function afterOnTimeMonths(pct, n, k) {
  return { pct: Math.round((pct * n + 100 * k) / (n + k)), months: Math.min(60, n + k) };
}

/*
 * Each term: `improve` is the advice in the applicant's own numbers; `target` is what the inputs become after
 * following it, used for the projected score; `months` is how long it takes before a re-application would show
 * it; `group` stops two steps that describe the same months of payments being counted twice in the plan.
 */
const TERMS = [
  {
    id: "loanHistory",
    keys: ["new_borrower", "missed_payments"],
    label: "Loan repayment history",
    value: (ctx) => LOAN_COPY[ctx.loanHistory].value,
    message: (ctx) => LOAN_COPY[ctx.loanHistory].message,
    improve: (ctx) => LOAN_COPY[ctx.loanHistory].improve,
    action: (ctx) => LOAN_COPY[ctx.loanHistory].action,
    target: () => ({ loanHistory: "repaid" }),
    months: 6,
  },
  {
    id: "rentOnTime",
    group: "rent",
    keys: ["rent_on_time_evidence"],
    label: "Rent on-time record",
    value: (ctx) => `${ctx.rentOnTimePct}% over ${months(ctx.rentMonths)}`,
    positive: "Consistent rent payments are one of the strongest signals in this model.",
    negative: "Late rent payments, or too short a record to prove consistency, weighed on the score.",
    improve: (ctx) => {
      const next = afterOnTimeMonths(ctx.rentOnTimePct, ctx.rentMonths, RECORD_MONTHS);
      return `Rent is on time ${ctx.rentOnTimePct}% of the time over ${months(ctx.rentMonths)}. Pay on or before the due date for the next ${RECORD_MONTHS} months and it becomes ${next.pct}% over ${months(next.months)}.`;
    },
    action: () => "Pay rent by bank transfer or UPI on or before the due date",
    target: (ctx) => {
      const next = afterOnTimeMonths(ctx.rentOnTimePct, ctx.rentMonths, RECORD_MONTHS);
      return { rentOnTimePct: next.pct, rentMonths: next.months };
    },
    months: RECORD_MONTHS,
  },
  {
    id: "utilityOnTime",
    group: "utility",
    keys: ["utility_on_time_evidence"],
    label: "Bill on-time record",
    value: (ctx) => `${ctx.utilityOnTimePct}% over ${months(ctx.utilityMonths)}`,
    positive: "You pay utility bills on time more often than the typical applicant.",
    negative: "Late bills, or too short a record to prove consistency, weighed on the score.",
    improve: (ctx) => {
      const next = afterOnTimeMonths(ctx.utilityOnTimePct, ctx.utilityMonths, RECORD_MONTHS);
      return `Bills are paid on time ${ctx.utilityOnTimePct}% of the time over ${months(ctx.utilityMonths)}. Put electricity and water on autopay for ${RECORD_MONTHS} months and it becomes ${next.pct}% over ${months(next.months)}.`;
    },
    action: () => "Put electricity and water bills on autopay",
    target: (ctx) => {
      const next = afterOnTimeMonths(ctx.utilityOnTimePct, ctx.utilityMonths, RECORD_MONTHS);
      return { utilityOnTimePct: next.pct, utilityMonths: next.months };
    },
    months: RECORD_MONTHS,
  },
  {
    id: "essentials",
    keys: ["essentials_ratio"],
    label: "Essentials against income",
    value: (ctx) => `${Math.round(ctx.essentialsRatio * 100)}% of income`,
    positive: "Your essentials, adjusted for local inflation, leave a healthy share of income free.",
    negative: "Your essentials, adjusted for local inflation, take up most of your income.",
    improve: (ctx) => {
      const pct = Math.round(ctx.essentialsRatio * 100);
      const cut = ctx.essentials - 0.6 * ctx.monthlyIncome;
      if (cut <= 0) {
        return `Essentials take ${pct}% of income (${inr(ctx.essentials)} of ${inr(ctx.monthlyIncome)}). Lowering them further leaves more room each month.`;
      }
      return `Essentials take ${pct}% of income (${inr(ctx.essentials)} of ${inr(ctx.monthlyIncome)}). Cutting about ${inr(cut)} a month, or showing that much more regular income, brings them to 60%.`;
    },
    action: (ctx) => {
      const cut = ctx.essentials - 0.6 * ctx.monthlyIncome;
      return cut > 0 ? `Cut about ${inr(cut)} a month from fixed costs, or document extra income` : "Trim one fixed monthly cost";
    },
    target: (ctx) => ({ essentialsRatio: Math.min(ctx.essentialsRatio, 0.6) }),
    months: 1,
  },
  {
    id: "employment",
    keys: ["employment_rank"],
    label: "Employment",
    value: (ctx) => EMPLOYMENT_NAMES[ctx.employmentType],
    positive: "Your employment type gives lenders steadier income to plan around.",
    negative: "Less predictable income makes repayments harder to plan.",
    improve: (ctx) => EMPLOYMENT_IMPROVE[ctx.employmentType],
    target: () => null,
  },
  {
    id: "rechargeCapability",
    keys: ["recharge_coverage"],
    label: "Recharge capability",
    value: (ctx) => `${ctx.rechargeCoverage.toFixed(1)}× the cheapest live plan`,
    positive: "Your recharge spend comfortably covers the cheapest current plan from your operator.",
    negative: "Your recharge spend is close to, or below, the cheapest current plan from your operator.",
    improve: (ctx) =>
      `You spend ${inr(ctx.monthlyRechargeSpend)} a month; the cheapest ${OPERATOR_NAMES[ctx.operator]} plan costs ${inr(ctx.cheapestMonthly)}. Keeping a plan of about ${inr(2 * ctx.cheapestMonthly)} a month active without gaps shows steady cash flow.`,
    action: (ctx) => `Keep a ${OPERATOR_NAMES[ctx.operator]} plan of about ${inr(2 * ctx.cheapestMonthly)} a month active without gaps`,
    target: (ctx) => ({ rechargeCoverage: Math.max(ctx.rechargeCoverage, 2) }),
    months: 1,
  },
  {
    id: "rentHistory",
    group: "rent",
    keys: ["rent_months"],
    label: "Rent history length",
    value: (ctx) => months(ctx.rentMonths),
    positive: "You have a meaningful track record of paying housing costs.",
    negative: "Rent history is brief, so the model cannot yet reward stability.",
    improve: (ctx) => {
      const next = afterOnTimeMonths(ctx.rentOnTimePct, ctx.rentMonths, HISTORY_MONTHS);
      return `You have ${months(ctx.rentMonths)} of rent history. Staying in a documented rental and paying on time for ${HISTORY_MONTHS} more months makes it ${months(next.months)} at ${next.pct}% on time.`;
    },
    action: () => "Keep rent receipts or bank transfers for every month",
    target: (ctx) => {
      const next = afterOnTimeMonths(ctx.rentOnTimePct, ctx.rentMonths, HISTORY_MONTHS);
      return { rentOnTimePct: next.pct, rentMonths: next.months };
    },
    months: HISTORY_MONTHS,
  },
  {
    id: "utilityHistory",
    group: "utility",
    keys: ["utility_months"],
    label: "Utility history length",
    value: (ctx) => months(ctx.utilityMonths),
    positive: "A longer utility history gives lenders more signal to work with.",
    negative: "Utility history is still short, so there is less evidence of consistency.",
    improve: (ctx) => {
      const next = afterOnTimeMonths(ctx.utilityOnTimePct, ctx.utilityMonths, HISTORY_MONTHS);
      return `You have ${months(ctx.utilityMonths)} of bill history. Keeping the same accounts and paying on time for ${HISTORY_MONTHS} more months makes it ${months(next.months)} at ${next.pct}% on time.`;
    },
    action: () => "Keep the same electricity and water accounts in your name",
    target: (ctx) => {
      const next = afterOnTimeMonths(ctx.utilityOnTimePct, ctx.utilityMonths, HISTORY_MONTHS);
      return { utilityOnTimePct: next.pct, utilityMonths: next.months };
    },
    months: HISTORY_MONTHS,
  },
];

const CLEAR_SCORE = 70;
// Horizon for applicants who are already Clear: steps that pay off within 6 months.
const CLEAR_HORIZON_MONTHS = 6;

/*
 * Combined plan. Steps run in parallel, so the plan looks for the earliest month by which doing every
 * step that finishes in time reaches Clear. Two steps in the same group (6 vs 12 months of rent) describe
 * the same payments, so only the longest one that fits is used. Steps that aren't needed are then dropped.
 * Milestones re-score with only the steps finished by each month, which is when a re-application would show them.
 */
function buildPlan(ctx, score, terms) {
  const goal = score < CLEAR_SCORE ? { score: CLEAR_SCORE, band: "clear", label: "Clear" } : null;
  const candidates = TERMS.filter((t) => t.months && terms.find((r) => r.key === t.id)?.direction === "held-back");

  // Applies steps in a fixed order (quickest first) so each target builds on the previous ones.
  const ordered = (list) => [...list].sort((a, b) => a.months - b.months);
  const scoreOf = (list) => {
    let overrides = {};
    for (const term of ordered(list)) overrides = { ...overrides, ...term.target({ ...ctx, ...overrides }) };
    return toScore(riskModel.scoreLogit({ ...ctx, ...overrides }));
  };
  const stepsWithin = (horizon) => {
    const fit = candidates.filter((t) => t.months <= horizon);
    return fit.filter((t) => !t.group || !fit.some((o) => o.group === t.group && o.months > t.months));
  };

  const horizons = [...new Set(candidates.map((t) => t.months))].sort((a, b) => a - b);
  let chosen = [];
  if (goal) {
    const horizon = horizons.find((h) => scoreOf(stepsWithin(h)) >= goal.score) ?? horizons.at(-1);
    chosen = horizon ? stepsWithin(horizon) : [];
  } else {
    chosen = stepsWithin(Math.max(...horizons.filter((h) => h <= CLEAR_HORIZON_MONTHS), 0));
  }

  // Drop the least useful step while the plan still reaches its goal (or, for Clear applicants, while
  // the step adds under a point).
  const best = scoreOf(chosen);
  for (;;) {
    const removable = chosen
      .map((term) => ({ term, without: scoreOf(chosen.filter((t) => t !== term)) }))
      .filter(({ without }) => (goal && best >= goal.score ? without >= goal.score : without >= best))
      .sort((a, b) => b.without - a.without);
    if (!removable.length) break;
    chosen = chosen.filter((t) => t !== removable[0].term);
  }

  chosen = ordered(chosen);
  const steps = chosen.map((term, i) => ({
    key: term.id,
    label: term.label,
    action: term.action(ctx),
    months: term.months,
    scoreAfter: scoreOf(chosen.slice(0, i + 1)),
  }));

  const milestones = [...new Set(chosen.map((t) => t.months))].map((month) => {
    const expectedScore = scoreOf(chosen.filter((t) => t.months <= month));
    return {
      month,
      completes: chosen.filter((t) => t.months === month).map((t) => t.label),
      expectedScore,
      band: bandFor(expectedScore).id,
    };
  });

  const finalScore = scoreOf(chosen);
  return {
    currentScore: score,
    goal,
    finalScore,
    reachesGoal: goal ? finalScore >= goal.score : true,
    steps,
    milestones,
  };
}

function computeModelScore(input, signals) {
  const ctx = { ...input, ...signals };
  const z = riskModel.scoreLogit(ctx);
  const score = toScore(z);
  const risk = riskModel.riskContributions(ctx);
  const pointsFor = (c) => Math.round(100 / (1 + Math.exp(-z)) - 100 / (1 + Math.exp(-(z - c))));

  const terms = TERMS.map((term) => {
    const contribution = riskModel.toScoreUnits(term.keys.reduce((sum, key) => sum + risk[key], 0));
    const direction = Math.abs(contribution) < 0.01 ? "neutral" : contribution > 0 ? "helped" : "held-back";
    const improve = direction === "held-back" ? term.improve(ctx) : undefined;
    const overrides = improve ? term.target(ctx) : null;
    const projectedScore = overrides ? toScore(riskModel.scoreLogit({ ...ctx, ...overrides })) : undefined;
    return {
      key: term.id,
      label: term.label,
      value: term.value(ctx),
      contribution: Number(contribution.toFixed(4)),
      points: pointsFor(contribution),
      direction,
      message: term.message ? term.message(ctx) : contribution >= 0 ? term.positive : term.negative,
      improve,
      projectedScore: projectedScore > score ? projectedScore : undefined,
    };
  });

  const ranked = [...terms].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    modelVersion: riskModel.MODEL_VERSION,
    scoringMethod: "logistic-regression",
    trainingData: riskModel.TRAINING_DATA,
    score,
    probability: Number(riskModel.defaultProbability(input, signals).toFixed(4)),
    band: bandFor(score),
    topFactors: ranked.filter((t) => t.direction !== "neutral").slice(0, 3),
    contributions: ranked,
    plan: buildPlan(ctx, score, terms),
  };
}

function computeScore(input, signals) {
  if (riskModel) {
    try {
      return computeModelScore(input, signals);
    } catch (err) {
      console.log(JSON.stringify({ level: "WARN", event: "model.score_failed", message: err.message }));
    }
  }
  return { ...computeFormulaScore(input, signals), scoringMethod: "rule-formula" };
}

module.exports = { computeScore };
