/**
 * Serves the logistic regression trained in ml/train.py. No ML runtime is needed:
 * risk log-odds = intercept + sum(weight × (feature − mean) / scale).
 *
 * The weights were learned from SIMULATED repayment outcomes, so this proves the
 * pipeline but must not make real lending decisions.
 */

const model = require("./model/logistic_model.json");

// Mirrors score_from_probability in ml/features.py:
// score 70 at 10% default risk, score 50 at 25%.
const GOOD_ODDS_AT_SCORE_50 = Math.log(3);
const SCORE_SLOPE = Math.log(0.7 / 0.3) / (Math.log(9) - Math.log(3));

const { constants } = model;

function onTimeEvidence(onTimePct, months) {
  const confidence = Math.min(1, months / constants.fullEvidenceMonths);
  return constants.onTimePrior + (onTimePct - constants.onTimePrior) * confidence;
}

function featureValues(ctx) {
  return {
    essentials_ratio: Math.min(constants.maxEssentialsRatio, ctx.essentialsRatio),
    recharge_coverage: Math.min(constants.maxRechargeCoverage, ctx.rechargeCoverage),
    rent_on_time_evidence: onTimeEvidence(ctx.rentOnTimePct, ctx.rentMonths),
    utility_on_time_evidence: onTimeEvidence(ctx.utilityOnTimePct, ctx.utilityMonths),
    rent_months: ctx.rentMonths,
    utility_months: ctx.utilityMonths,
    employment_rank: constants.employmentRank[ctx.employmentType],
    new_borrower: ctx.loanHistory === "none" ? 1 : 0,
    missed_payments: ctx.loanHistory === "missed" ? 1 : 0,
  };
}

/** Each input's change to default-risk log-odds, relative to the average applicant. */
function riskContributions(ctx) {
  const values = featureValues(ctx);
  return Object.fromEntries(
    model.features.map(({ key, mean, scale, weight }) => {
      const value = values[key];
      if (!Number.isFinite(value)) throw new Error(`Model input ${key} is invalid`);
      return [key, (weight * (value - mean)) / scale];
    }),
  );
}

function riskLogOdds(ctx) {
  return model.intercept + Object.values(riskContributions(ctx)).reduce((sum, c) => sum + c, 0);
}

function defaultProbability(input, signals) {
  return 1 / (1 + Math.exp(-riskLogOdds({ ...input, ...signals })));
}

/** Score logit: higher is safer. Linear in the inputs, so explanations stay exact. */
function scoreLogit(ctx) {
  return SCORE_SLOPE * (-riskLogOdds(ctx) - GOOD_ODDS_AT_SCORE_50);
}

/** A risk contribution expressed in score-logit units (positive helps the applicant). */
const toScoreUnits = (riskContribution) => -SCORE_SLOPE * riskContribution;

module.exports = {
  MODEL_VERSION: model.version,
  TRAINING_DATA: model.trainingData,
  defaultProbability,
  riskContributions,
  scoreLogit,
  toScoreUnits,
};
