/**
 * Loan eligibility from live market data.
 * - Interest rate = RBI repo rate + a fixed lender spread
 * - Monthly living costs are inflated by the state's CPI
 * - New and existing repayments together are capped at 50% of monthly income, following
 *   the RBI microfinance framework (2022) limit on household repayment obligations
 * - Recharge capability compares the applicant's recharge spend to the cheapest live plan
 */

// Assumption: NBFC-MFI style pricing over repo. Tune with real lender data.
const LENDER_SPREAD_PCT = 16;
const MAX_REPAYMENT_SHARE = 0.5;
// Keep 40% of the monthly surplus as a buffer for shocks.
const SURPLUS_USABLE_SHARE = 0.6;
const MIN_LOAN = 1000;
const OPERATOR_NAMES = { jio: "Jio", airtel: "Airtel", vi: "Vi", bsnl: "BSNL" };
const LIVING_COSTS = [
  "monthlyRent",
  "monthlyFood",
  "monthlyTransport",
  "monthlyElectricity",
  "monthlyWaterGas",
  "monthlyRechargeSpend",
  "monthlyMedical",
  "monthlyEducation",
];

function emi(principal, annualRatePct, months) {
  const r = annualRatePct / 1200;
  return (principal * r) / (1 - (1 + r) ** -months);
}

function principalFor(monthlyPayment, annualRatePct, months) {
  const r = annualRatePct / 1200;
  return (monthlyPayment * (1 - (1 + r) ** -months)) / r;
}

/** Signals from market data that also feed the credit score. */
function deriveSignals(input, market) {
  const inflationPct = Math.max(0, market.inflation.rate);
  const livingCosts = LIVING_COSTS.reduce((sum, field) => sum + input[field], 0);
  // Inflation raises living costs; an existing EMI is a fixed amount.
  const essentials = livingCosts * (1 + inflationPct / 100) + input.existingEmi;
  const surplus = input.monthlyIncome - essentials;
  const cheapestMonthly = market.telecom.cheapest.monthlyCost;

  return {
    essentials: Math.round(essentials),
    surplus: Math.round(surplus),
    essentialsRatio: essentials / input.monthlyIncome,
    incomeBuffer: surplus / input.monthlyIncome,
    rechargeCoverage: input.monthlyRechargeSpend / cheapestMonthly,
    cheapestMonthly,
    inflationPct,
  };
}

function assessEligibility(input, market, signals, scored) {
  const annualRatePct = Number((market.repoRate + LENDER_SPREAD_PCT).toFixed(2));
  const bandShare = scored.band.id === "clear" ? 1 : scored.band.id === "borderline" ? 0.75 : 0;
  const repaymentLimit = MAX_REPAYMENT_SHARE * input.monthlyIncome;
  const capacity = Math.max(
    0,
    Math.min(repaymentLimit - input.existingEmi, SURPLUS_USABLE_SHARE * signals.surplus) * bandShare,
  );
  const requestedEmi = emi(input.loanAmount, annualRatePct, input.loanTenureMonths);
  const sustainsBasicPlan = signals.rechargeCoverage >= 1;
  // Recharge spend below the cheapest plan signals tight cash flow: halve what we offer.
  const rechargeFactor = sustainsBasicPlan ? 1 : 0.5;
  const maxAmount =
    Math.floor((principalFor(capacity, annualRatePct, input.loanTenureMonths) * rechargeFactor) / 500) * 500;

  const checks = [
    {
      id: "score",
      label: "Credit score band",
      passed: bandShare > 0,
      detail: `Score ${scored.score} (${scored.band.label}).`,
    },
    {
      id: "repayment",
      label: "Repayment within 50% of income",
      passed: requestedEmi + input.existingEmi <= repaymentLimit,
      detail: `New EMI ₹${Math.round(requestedEmi).toLocaleString("en-IN")} plus existing EMIs ₹${input.existingEmi.toLocaleString("en-IN")}, against income ₹${input.monthlyIncome.toLocaleString("en-IN")}.`,
    },
    {
      id: "surplus",
      label: "Fits the monthly surplus",
      passed: requestedEmi <= SURPLUS_USABLE_SHARE * signals.surplus,
      detail: `Surplus after inflation-adjusted essentials is ₹${signals.surplus.toLocaleString("en-IN")}.`,
    },
    {
      id: "recharge",
      label: "Recharge covers the cheapest live plan",
      passed: sustainsBasicPlan,
      detail: `You spend ₹${input.monthlyRechargeSpend}/month; the cheapest ${OPERATOR_NAMES[market.telecom.operator]} plan costs ₹${signals.cheapestMonthly}/month.`,
    },
  ];

  let decision;
  if (bandShare === 0 || maxAmount < MIN_LOAN) {
    decision = {
      id: "not-yet",
      label: "Not yet",
      detail: "The file needs a few more months of evidence before a loan is affordable. The plan below shows what to work on.",
    };
  } else if (input.loanAmount <= maxAmount) {
    decision = {
      id: "eligible",
      label: "Eligible",
      detail: `You qualify for ₹${input.loanAmount.toLocaleString("en-IN")} over ${input.loanTenureMonths} months.`,
    };
  } else {
    decision = {
      id: "reduced",
      label: "Eligible for a smaller amount",
      detail: `A loan of up to ₹${maxAmount.toLocaleString("en-IN")} over ${input.loanTenureMonths} months fits your budget today.`,
    };
  }

  return {
    decision,
    requestedAmount: input.loanAmount,
    tenureMonths: input.loanTenureMonths,
    annualRatePct,
    repoRatePct: market.repoRate,
    lenderSpreadPct: LENDER_SPREAD_PCT,
    requestedEmi: Math.round(requestedEmi),
    maxAmount: Math.max(0, Math.min(maxAmount, input.loanAmount)),
    monthlyCapacity: Math.round(capacity),
    essentials: signals.essentials,
    surplus: signals.surplus,
    inflationPct: market.inflation.rate,
    inflationRegion: market.inflation.region,
    inflationPeriod: market.inflation.period,
    cheapestPlan: market.telecom.cheapest,
    rechargeCoverage: Number(signals.rechargeCoverage.toFixed(2)),
    checks,
  };
}

module.exports = { deriveSignals, assessEligibility, emi };
