// Maps a synthetic row to the shape the API uses.

const { deriveSignals } = require("../infra/src/eligibility");

const toApplication = (a) => ({
  employmentType: a.employment_type,
  loanHistory: a.loan_history,
  monthlyIncome: a.monthly_income,
  monthlyRent: a.rent,
  monthlyFood: a.food,
  monthlyTransport: a.transport,
  monthlyElectricity: a.electricity,
  monthlyWaterGas: a.water_gas,
  monthlyMedical: a.medical,
  monthlyEducation: a.education,
  existingEmi: a.existing_emi,
  monthlyRechargeSpend: a.recharge,
  rentOnTimePct: a.rent_on_time_pct,
  rentMonths: a.rent_months,
  utilityOnTimePct: a.utility_on_time_pct,
  utilityMonths: a.utility_months,
  rechargeFrequency: 1,
});

const toSignals = (a, inflationRate) =>
  deriveSignals(toApplication(a), {
    inflation: { rate: inflationRate },
    telecom: { cheapest: { monthlyCost: a.operator_baseline } },
  });

module.exports = { toApplication, toSignals };
