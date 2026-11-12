// MoSPI CPI state codes. Keep in sync with infra/src/sources/states.js.
export const STATES = [
  ["99", "Other / All India"],
  ["28", "Andhra Pradesh"],
  ["18", "Assam"],
  ["10", "Bihar"],
  ["22", "Chhattisgarh"],
  ["7", "Delhi"],
  ["24", "Gujarat"],
  ["6", "Haryana"],
  ["20", "Jharkhand"],
  ["29", "Karnataka"],
  ["32", "Kerala"],
  ["23", "Madhya Pradesh"],
  ["27", "Maharashtra"],
  ["21", "Odisha"],
  ["3", "Punjab"],
  ["8", "Rajasthan"],
  ["33", "Tamil Nadu"],
  ["36", "Telangana"],
  ["9", "Uttar Pradesh"],
  ["5", "Uttarakhand"],
  ["19", "West Bengal"],
];

export const OPERATORS = [
  ["jio", "Jio"],
  ["airtel", "Airtel"],
  ["vi", "Vi"],
  ["bsnl", "BSNL"],
];

export const EMPLOYMENT = [
  ["salaried", "Salaried"],
  ["self-employed", "Self-employed"],
  ["informal", "Informal / gig"],
  ["unemployed", "Not currently employed"],
];

export const LOAN_HISTORY = [
  ["none", "Never taken a loan"],
  ["repaid", "Yes, repaid on time"],
  ["missed", "Yes, missed some payments"],
];

export const labelFor = (list, value) => list.find(([id]) => id === value)?.[1] ?? value;

export const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// Mirrors the backend spread over the RBI repo rate (infra/src/eligibility.js).
export const LENDER_SPREAD_PCT = 16;

export function estimateEmi(principal, annualRatePct, months) {
  const r = annualRatePct / 1200;
  if (!principal || !months || !r) return 0;
  return (principal * r) / (1 - (1 + r) ** -months);
}
