import { useRef, useState } from "react";
import { Button } from "../../design/Button";
import { Card, Eyebrow } from "../../design/Card";
import { Choice, Field, Select, TextInput } from "../../design/Field";
import { Stepper } from "../../design/Stepper";
import { postScore } from "../../lib/api";
import { gsap, prefersReducedMotion, useGSAP } from "../../lib/motion";
import {
  EMPLOYMENT,
  LENDER_SPREAD_PCT,
  LOAN_HISTORY,
  OPERATORS,
  STATES,
  estimateEmi,
  labelFor,
  rupees,
} from "../../lib/options";
import { saveResult } from "../../lib/resultStore";
import { LiveMarketPanel } from "../market/LiveMarketPanel";
import { useMarket } from "../market/useMarket";
import { LoadingScore, ResultScreen, ReviewList, ScoreError } from "./ResultScreen";

const STEPS = ["About you", "Income & rent", "Bills", "Living costs", "Mobile", "Loan", "Review"];
const MOBILE_STEP = 4;
const LOAN_STEP = 5;
const REVIEW_STEP = 6;

// Every rupee here counts the same in the model's essentials-to-income ratio.
const LIVING_COSTS = [
  "monthlyRent",
  "monthlyFood",
  "monthlyTransport",
  "monthlyElectricity",
  "monthlyWaterGas",
  "monthlyRechargeSpend",
  "monthlyMedical",
  "monthlyEducation",
  "existingEmi",
];

// Mirrors infra/src/validate.js.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const empty = {
  name: "",
  email: "",
  stateCode: "99",
  employmentType: "informal",
  loanHistory: "none",
  monthlyIncome: "",
  monthlyRent: "",
  rentOnTimePct: 85,
  rentMonths: 12,
  monthlyElectricity: "",
  monthlyWaterGas: "",
  utilityOnTimePct: 80,
  utilityMonths: 12,
  monthlyFood: "",
  monthlyTransport: "",
  monthlyMedical: 0,
  monthlyEducation: 0,
  existingEmi: 0,
  operator: "jio",
  monthlyRechargeSpend: "",
  rechargeFrequency: 1,
  loanAmount: 15000,
  loanTenureMonths: 12,
  consent: false,
};

// [field, min, max, message] per step; mirrors infra/src/validate.js
const RULES = {
  1: [
    ["monthlyIncome", 1000, 500000, "Enter monthly income between ₹1,000 and ₹5,00,000."],
    ["monthlyRent", 0, 200000, "Enter rent between ₹0 and ₹2,00,000."],
    ["rentOnTimePct", 0, 100, "Enter a percentage between 0 and 100."],
    ["rentMonths", 1, 60, "Enter months between 1 and 60."],
  ],
  2: [
    ["monthlyElectricity", 0, 50000, "Enter an amount between ₹0 and ₹50,000."],
    ["monthlyWaterGas", 0, 50000, "Enter an amount between ₹0 and ₹50,000."],
    ["utilityOnTimePct", 0, 100, "Enter a percentage between 0 and 100."],
    ["utilityMonths", 1, 60, "Enter months between 1 and 60."],
  ],
  3: [
    ["monthlyFood", 0, 200000, "Enter an amount between ₹0 and ₹2,00,000."],
    ["monthlyTransport", 0, 100000, "Enter an amount between ₹0 and ₹1,00,000."],
    ["monthlyMedical", 0, 200000, "Enter an amount between ₹0 and ₹2,00,000."],
    ["monthlyEducation", 0, 200000, "Enter an amount between ₹0 and ₹2,00,000."],
    ["existingEmi", 0, 500000, "Enter an amount between ₹0 and ₹5,00,000."],
  ],
  4: [
    ["monthlyRechargeSpend", 10, 5000, "Enter a monthly spend between ₹10 and ₹5,000."],
    ["rechargeFrequency", 0, 12, "Enter a number between 0 and 12."],
  ],
  5: [
    ["loanAmount", 1000, 500000, "Enter an amount between ₹1,000 and ₹5,00,000."],
    ["loanTenureMonths", 3, 36, "Enter a tenure between 3 and 36 months."],
  ],
};

function validateStep(step, values) {
  const errors = {};
  if (step === 0 && values.name.trim().length < 2) errors.name = "Please enter your full name.";
  if (step === 0 && !EMAIL.test(values.email.trim())) errors.email = "Enter a valid email address, like name@example.com.";
  for (const [field, min, max, message] of RULES[step] ?? []) {
    const raw = values[field];
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < min || n > max) errors[field] = message;
  }
  return errors;
}

function Group({ legend, hint, children }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

export function IntakePage() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("form");
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const stepRef = useRef(null);
  const market = useMarket(values.operator, values.stateCode);

  useGSAP(
    () => {
      if (!stepRef.current || prefersReducedMotion()) return;
      gsap.fromTo(stepRef.current, { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" });
    },
    { dependencies: [step, phase] },
  );

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  // Numeric input bound to a field, with its error wired for screen readers.
  const num = (field, extra = {}) => ({
    type: "number",
    inputMode: "decimal",
    value: values[field],
    onChange: (e) => update(field, e.target.value),
    "aria-invalid": Boolean(errors[field]),
    ...extra,
  });

  function next() {
    const nextErrors = validateStep(step, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  function restart() {
    setValues(empty);
    setErrors({});
    setStep(0);
    setResult(null);
    setConfirmDiscard(false);
    setPhase("form");
  }

  async function submit() {
    if (!values.consent) {
      setErrors({ consent: "Please tick the box to confirm your details and agree to the privacy notice." });
      return;
    }
    setPhase("loading");
    setErrorMessage("");
    try {
      const payload = { ...values, name: values.name.trim(), email: values.email.trim() };
      for (const field of Object.values(RULES).flat().map(([f]) => f)) payload[field] = Number(values[field]);
      const data = await postScore(payload);
      saveResult(data);
      setResult(data);
      setPhase("result");
    } catch (err) {
      setErrorMessage(err.message || "Something went wrong.");
      setPhase("error");
    }
  }

  if (phase === "loading") return <LoadingScore />;
  if (phase === "error") {
    return (
      <ScoreError
        message={errorMessage}
        onRetry={submit}
        onBack={() => {
          setPhase("form");
          setStep(STEPS.length - 1);
        }}
      />
    );
  }
  if (phase === "result" && result) return <ResultScreen result={result} onRestart={restart} />;

  const operatorLabel = labelFor(OPERATORS, values.operator);
  const liveRate = market.data ? market.data.repoRatePct + LENDER_SPREAD_PCT : null;
  const emi = liveRate ? estimateEmi(Number(values.loanAmount), liveRate, Number(values.loanTenureMonths)) : 0;
  const coverage = market.data && values.monthlyRechargeSpend
    ? Number(values.monthlyRechargeSpend) / market.data.cheapestPlan.monthlyCost
    : null;
  const hasProgress = step > 0 || values.name.trim();
  const essentials = LIVING_COSTS.reduce((sum, field) => sum + (Number(values[field]) || 0), 0);
  const essentialsShare = Number(values.monthlyIncome) ? essentials / Number(values.monthlyIncome) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Eyebrow>Application</Eyebrow>
      <h1 className="font-display mt-4 text-4xl leading-tight text-ink md:text-5xl">Apply with the history you already have</h1>
      <p className="mt-5 text-ink-muted">One short set of questions at a time. Your answers decide which live data we check.</p>

      <div className="mt-12">
        <Stepper steps={STEPS} current={step} />
      </div>

      <Card className="mt-8">
        <div ref={stepRef} className="space-y-7">
          {step === 0 ? (
            <>
              <Field label="Full name" error={errors.name}>
                <TextInput
                  value={values.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Priya Sharma"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                />
              </Field>
              <Field label="Email" error={errors.email} hint="We’ll email your full report: score, breakdown and improvement plan.">
                <TextInput
                  type="email"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="priya@example.com"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={Boolean(errors.email)}
                />
              </Field>
              <Field label="State" hint="Sets which regional inflation figure we fetch.">
                <Select value={values.stateCode} onChange={(e) => update("stateCode", e.target.value)}>
                  {STATES.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Group legend="Employment">
                <Choice name="Employment" options={EMPLOYMENT} value={values.employmentType} onChange={(v) => update("employmentType", v)} />
              </Group>
              <Group legend="Have you taken a loan before?" hint="New borrowers start a little lower; a loan repaid on time lifts the score.">
                <Choice name="Loan history" options={LOAN_HISTORY} value={values.loanHistory} onChange={(v) => update("loanHistory", v)} />
              </Group>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Monthly income" prefix="₹" error={errors.monthlyIncome}>
                  <TextInput {...num("monthlyIncome", { placeholder: "22000", min: 1000 })} prefix="₹" />
                </Field>
                <Field label="Monthly rent" prefix="₹" error={errors.monthlyRent} hint="Enter 0 if you don’t pay rent.">
                  <TextInput {...num("monthlyRent", { placeholder: "7000", min: 0 })} prefix="₹" />
                </Field>
              </div>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Rent paid on time (%)" error={errors.rentOnTimePct}>
                  <TextInput {...num("rentOnTimePct", { min: 0, max: 100 })} />
                </Field>
                <Field label="Months of rent history" error={errors.rentMonths}>
                  <TextInput {...num("rentMonths", { min: 1, max: 60 })} />
                </Field>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Electricity" prefix="₹" error={errors.monthlyElectricity}>
                  <TextInput {...num("monthlyElectricity", { placeholder: "800", min: 0 })} prefix="₹" />
                </Field>
                <Field label="Water and gas" prefix="₹" error={errors.monthlyWaterGas}>
                  <TextInput {...num("monthlyWaterGas", { placeholder: "400", min: 0 })} prefix="₹" />
                </Field>
              </div>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Bills paid on time (%)" error={errors.utilityOnTimePct}>
                  <TextInput {...num("utilityOnTimePct", { min: 0, max: 100 })} />
                </Field>
                <Field label="Months of bill history" error={errors.utilityMonths}>
                  <TextInput {...num("utilityMonths", { min: 1, max: 60 })} />
                </Field>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-sm text-ink-muted">Monthly amounts for your household. Enter 0 for anything you don’t pay.</p>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Food and groceries" prefix="₹" error={errors.monthlyFood}>
                  <TextInput {...num("monthlyFood", { placeholder: "6000", min: 0 })} prefix="₹" />
                </Field>
                <Field label="Fuel and transport" prefix="₹" error={errors.monthlyTransport}>
                  <TextInput {...num("monthlyTransport", { placeholder: "1500", min: 0 })} prefix="₹" />
                </Field>
                <Field label="Medical" prefix="₹" error={errors.monthlyMedical}>
                  <TextInput {...num("monthlyMedical", { min: 0 })} prefix="₹" />
                </Field>
                <Field label="Education" prefix="₹" error={errors.monthlyEducation}>
                  <TextInput {...num("monthlyEducation", { min: 0 })} prefix="₹" />
                </Field>
              </div>
              <Field label="Existing loan EMIs" prefix="₹" error={errors.existingEmi} hint="Total monthly instalments on any loans you are repaying now.">
                <TextInput {...num("existingEmi", { min: 0 })} prefix="₹" />
              </Field>
              <div className="flex flex-col gap-1 rounded-2xl bg-paper p-5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm text-ink-muted">Essentials so far, incl. rent and bills</span>
                <span className="text-ink">
                  <span className="font-display text-2xl">{rupees(essentials)}</span>
                  {essentialsShare !== null ? (
                    <span className="ml-2 text-sm text-ink-muted">{Math.round(essentialsShare * 100)}% of income</span>
                  ) : null}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Medical and education are never penalised as categories. Every rupee of essentials counts the same.
              </p>
            </>
          ) : null}

          {step === MOBILE_STEP ? (
            <>
              <Group legend="Mobile operator" hint="We fetch this operator’s current prepaid plans.">
                <Choice name="Operator" options={OPERATORS} value={values.operator} onChange={(v) => update("operator", v)} />
              </Group>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Monthly recharge spend" prefix="₹" error={errors.monthlyRechargeSpend}>
                  <TextInput {...num("monthlyRechargeSpend", { placeholder: "349", min: 10 })} prefix="₹" />
                </Field>
                <Field label="Recharges per month" error={errors.rechargeFrequency} hint="A 28-day plan is about 1.">
                  <TextInput {...num("rechargeFrequency", { min: 0, max: 12, step: 0.5 })} />
                </Field>
              </div>
              <div className="rounded-2xl bg-paper p-5">
                <LiveMarketPanel market={market} operatorLabel={operatorLabel} compact />
                {coverage ? (
                  <p className="mt-5 border-t border-line pt-4 text-sm text-ink-muted">
                    Your {rupees(values.monthlyRechargeSpend)} covers{" "}
                    <span className={coverage >= 1 ? "font-medium text-sage-deep" : "font-medium text-ink"}>
                      {coverage.toFixed(1)}×
                    </span>{" "}
                    the cheapest live {operatorLabel} plan.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {step === LOAN_STEP ? (
            <>
              <div className="grid gap-7 sm:grid-cols-2">
                <Field label="Loan amount" prefix="₹" error={errors.loanAmount}>
                  <TextInput {...num("loanAmount", { min: 1000, step: 500 })} prefix="₹" />
                </Field>
                <Field label="Tenure (months)" error={errors.loanTenureMonths}>
                  <TextInput {...num("loanTenureMonths", { min: 3, max: 36 })} />
                </Field>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl bg-paper p-5 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm text-ink-muted">
                  Estimated EMI {liveRate ? `at ${liveRate.toFixed(1)}% (live repo + spread)` : ""}
                </span>
                <span className="font-display text-2xl text-ink">{emi ? `${rupees(emi)}/mo` : "—"}</span>
              </div>
            </>
          ) : null}

          {step === REVIEW_STEP ? (
            <>
              <ReviewList values={values} />
              <div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-paper p-5">
                  <input
                    type="checkbox"
                    checked={values.consent}
                    onChange={(e) => update("consent", e.target.checked)}
                    aria-invalid={Boolean(errors.consent)}
                    aria-describedby={errors.consent ? "consent-error" : undefined}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#557459]"
                  />
                  <span className="text-sm leading-relaxed text-ink-muted">
                    <span className="font-medium text-ink">I confirm these details are true and complete to the best of my knowledge.</span>{" "}
                    I agree that CreditClear may use them to assess my application and email me the report. They
                    are kept for 90 days and then deleted automatically. My email address is used only to send the report
                    and is not stored. See the{" "}
                    {/* New tab, so leaving the form doesn't lose the answers. */}
                    <a href="/privacy" target="_blank" rel="noreferrer" className="text-sage-deep underline underline-offset-2">
                      privacy notice
                    </a>
                    .
                  </span>
                </label>
                {errors.consent ? (
                  <p id="consent-error" className="mt-2 text-sm text-danger">
                    {errors.consent}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
          <Button variant="ghost" onClick={back} disabled={step === 0} className="px-0 disabled:bg-transparent">
            ← Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Continue</Button>
          ) : (
            <Button onClick={submit}>Check my eligibility</Button>
          )}
        </div>
      </Card>

      {hasProgress ? (
        <div className="mt-8 text-center">
          {confirmDiscard ? (
            <div className="rounded-[var(--radius-soft)] bg-danger-tint p-5 text-left" role="alertdialog" aria-label="Discard application">
              <p className="text-sm font-medium text-ink">Discard this application?</p>
              <p className="mt-1 text-sm text-ink-muted">Everything you’ve entered will be cleared. This can’t be undone.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="danger" onClick={restart}>
                  Discard application
                </Button>
                <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
                  Keep editing
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="text-sm text-ink-muted transition-colors hover:text-danger"
            >
              Discard application
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
