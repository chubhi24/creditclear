const { STATES } = require("./sources/states");
const { OPERATOR_IDS } = require("./sources/telecom");

const EMPLOYMENT = new Set(["salaried", "self-employed", "informal", "unemployed"]);
const LOAN_HISTORY = new Set(["none", "repaid", "missed"]);
const OPERATORS = new Set(OPERATOR_IDS);
// Practical check (one @, a dot in the domain, no spaces), not full RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const NUMBER_FIELDS = [
  ["monthlyIncome", 1000, 500000, "Monthly income must be ₹1,000–₹5,00,000."],
  ["monthlyRent", 0, 200000, "Monthly rent must be ₹0–₹2,00,000."],
  ["monthlyFood", 0, 200000, "Monthly food spend must be ₹0–₹2,00,000."],
  ["monthlyTransport", 0, 100000, "Monthly fuel and transport must be ₹0–₹1,00,000."],
  ["monthlyElectricity", 0, 50000, "Monthly electricity must be ₹0–₹50,000."],
  ["monthlyWaterGas", 0, 50000, "Monthly water and gas must be ₹0–₹50,000."],
  ["monthlyMedical", 0, 200000, "Monthly medical spend must be ₹0–₹2,00,000."],
  ["monthlyEducation", 0, 200000, "Monthly education spend must be ₹0–₹2,00,000."],
  ["existingEmi", 0, 500000, "Existing EMIs must be ₹0–₹5,00,000."],
  ["utilityOnTimePct", 0, 100, "Utility on-time payment % must be 0–100."],
  ["utilityMonths", 1, 60, "Utility months of history must be 1–60."],
  ["rentOnTimePct", 0, 100, "Rent on-time payment % must be 0–100."],
  ["rentMonths", 1, 60, "Rent months of history must be 1–60."],
  ["monthlyRechargeSpend", 10, 5000, "Monthly recharge spend must be ₹10–₹5,000."],
  ["rechargeFrequency", 0, 12, "Average monthly recharges must be 0–12."],
  ["loanAmount", 1000, 500000, "Loan amount must be ₹1,000–₹5,00,000."],
  ["loanTenureMonths", 3, 36, "Loan tenure must be 3–36 months."],
];

function isNumberInRange(value, min, max) {
  const n = Number(value);
  return value !== "" && value !== null && Number.isFinite(n) && n >= min && n <= max;
}

function validateApplication(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    errors.push("Name must be between 2 and 80 characters.");
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) {
    errors.push("Enter a valid email address for your report.");
  }
  if (body.consent !== true) {
    errors.push("Please confirm your details are true and agree to the privacy notice so we can assess your application.");
  }
  const stateCode = String(body.stateCode ?? "");
  if (!STATES[stateCode]) {
    errors.push("State is invalid.");
  }
  if (!EMPLOYMENT.has(body.employmentType)) {
    errors.push("Employment type is invalid.");
  }
  if (!LOAN_HISTORY.has(body.loanHistory)) {
    errors.push("Loan history must be one of none, repaid, missed.");
  }
  if (!OPERATORS.has(body.operator)) {
    errors.push(`Operator must be one of ${OPERATOR_IDS.join(", ")}.`);
  }
  for (const [field, min, max, message] of NUMBER_FIELDS) {
    if (!isNumberInRange(body[field], min, max)) errors.push(message);
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      stateCode,
      employmentType: body.employmentType,
      loanHistory: body.loanHistory,
      operator: body.operator,
      ...Object.fromEntries(NUMBER_FIELDS.map(([field]) => [field, Number(body[field])])),
    },
  };
}

module.exports = { validateApplication };
