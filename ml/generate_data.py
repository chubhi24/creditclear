"""
Synthetic thin-file borrower data for the CreditClear ML pipeline.

Spending patterns are anchored on MoSPI's Household Consumption Expenditure
Survey 2023-24. No public dataset links these Indian expense columns to loan
repayment, so the default outcome is SIMULATED from the assumptions in SCENARIOS.
A model trained here proves the pipeline. It is not evidence of real-world
predictive power and must not make real lending decisions.
"""

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

# MoSPI HCES 2023-24 press note: monthly per-capita spend (Rs) and share of spend.
HCES = {
    "rural": {"mpce": 4122, "food": 0.4704, "fuel_light": 0.0611, "conveyance": 0.0759, "medical": 0.0683, "education": 0.0324},
    "urban": {"mpce": 6996, "food": 0.3968, "fuel_light": 0.0559, "conveyance": 0.0846, "medical": 0.0585, "education": 0.0597},
}

# Monthly cost of the cheapest <=31-day plan per operator (crawled October 2026).
PLAN_BASELINES = np.array([203, 213, 320, 213])

EMPLOYMENT = np.array(["unemployed", "informal", "self-employed", "salaried"])
LOAN_HISTORY = np.array(["missed", "none", "repaid"])

# Everything below is an assumption, not an observed fact. Weights act on the log-odds of default.
SCENARIOS = {
    "base": {
        "default_rate": 0.15,
        "discipline": 1.0,
        "budget": 2.2,
        "history": 0.5,
        "recharge_gap": 0.35,
        "shock": 0.7,
        "employment": {"unemployed": 1.0, "informal": 0.25, "self-employed": 0.0, "salaried": -0.5},
        "loan_history": {"missed": 0.7, "none": 0.25, "repaid": -0.6},
    },
}
# Alternative worlds, used only to test how fragile a model trained on "base" is.
SCENARIOS["budget_matters_more"] = {**SCENARIOS["base"], "discipline": 0.5, "budget": 4.0}
SCENARIOS["discipline_matters_more"] = {**SCENARIOS["base"], "discipline": 1.6, "budget": 0.8}
SCENARIOS["noisier_world"] = {**SCENARIOS["base"], "shock": 1.4}
SCENARIOS["higher_default_rate"] = {**SCENARIOS["base"], "default_rate": 0.25}


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def simulate_applicants(n, rng):
    """Draws applicants and their observable answers, plus hidden traits used to simulate outcomes."""
    is_urban = rng.random(n) < 0.55
    sector = np.where(is_urban, "urban", "rural")
    household_size = rng.choice([1, 2, 3, 4, 5, 6, 7], size=n, p=[0.04, 0.10, 0.20, 0.30, 0.20, 0.10, 0.06])

    def hces(item):
        return np.where(is_urban, HCES["urban"][item], HCES["rural"][item])

    # Thin-file applicants are assumed to spend a little below the national average.
    consumption = hces("mpce") * household_size * 0.85 * rng.lognormal(0, 0.4, n)
    item = lambda name, sigma=0.35: consumption * hces(name) * rng.lognormal(0, sigma, n)

    food = item("food", 0.2)
    transport = item("conveyance", 0.5)
    fuel_light = item("fuel_light", 0.3)
    medical = item("medical", 0.8)
    education = item("education", 0.8)

    electricity = fuel_light * rng.uniform(0.35, 0.6, n)
    water_gas = fuel_light - electricity
    # HCES rent is an all-household average, so renters' rent is assumed instead.
    rent = consumption * np.where(is_urban, 0.2, 0.1) * rng.lognormal(0, 0.35, n)

    operator_baseline = rng.choice(PLAN_BASELINES, size=n)
    recharge = operator_baseline * rng.lognormal(0.25, 0.35, n) * rng.choice([1, 2], size=n, p=[0.7, 0.3])

    discretionary = consumption * rng.uniform(0.15, 0.35, n)
    spend = food + transport + fuel_light + medical + education + rent + recharge + discretionary
    savings_rate = np.clip(rng.normal(0.12, 0.18, n), -0.25, 0.55)
    income = spend / (1 - savings_rate)
    existing_emi = np.where(rng.random(n) < 0.3, income * rng.uniform(0.05, 0.35, n), 0)

    # Hidden trait: how reliably someone pays. Only its noisy traces are observable.
    discipline = rng.normal(0, 1, n)
    on_time = lambda bias: np.round(100 * sigmoid(bias + 0.9 * discipline + rng.normal(0, 0.5, n)), 1)

    borrowed = rng.random(n) < 0.4
    repaid = rng.random(n) < sigmoid(1.5 + 1.2 * discipline)
    loan_history = np.where(~borrowed, "none", np.where(repaid, "repaid", "missed"))

    frame = pd.DataFrame(
        {
            "monthly_income": income,
            "rent": rent,
            "food": food,
            "transport": transport,
            "electricity": electricity,
            "water_gas": water_gas,
            "recharge": recharge,
            "medical": medical,
            "education": education,
            "existing_emi": existing_emi,
            "rent_on_time_pct": on_time(1.6),
            "utility_on_time_pct": on_time(1.3),
            "rent_months": np.clip(np.round(rng.lognormal(2.6, 0.8, n)), 1, 60),
            "utility_months": np.clip(np.round(rng.lognormal(2.6, 0.8, n)), 1, 60),
            "operator_baseline": operator_baseline,
            "employment_type": rng.choice(EMPLOYMENT, size=n, p=[0.05, 0.50, 0.25, 0.20]),
            "loan_history": loan_history,
            # Audit columns are never model inputs.
            "audit_sector": sector,
            "audit_household_size": household_size,
            "audit_discipline": discipline,
        }
    )
    money = ["monthly_income", "rent", "food", "transport", "electricity", "water_gas", "recharge", "medical", "education", "existing_emi"]
    frame[money] = frame[money].round(0)
    return frame


def essentials_ratio(frame):
    columns = ["rent", "food", "transport", "electricity", "water_gas", "recharge", "medical", "education", "existing_emi"]
    return frame[columns].sum(axis=1) / frame["monthly_income"]


def add_outcomes(frame, scenario, rng):
    """Simulates whether each applicant defaults within 12 months."""
    weights = SCENARIOS[scenario]
    months = (frame["rent_months"] + frame["utility_months"]) / 2
    shock = rng.normal(0, 1, len(frame))
    risk = (
        -weights["discipline"] * frame["audit_discipline"]
        + weights["budget"] * (essentials_ratio(frame) - 0.8).clip(-0.5, 1.0)
        + weights["history"] * np.exp(-months / 12)
        + weights["recharge_gap"] * (frame["recharge"] < frame["operator_baseline"])
        + frame["employment_type"].map(weights["employment"])
        + frame["loan_history"].map(weights["loan_history"])
    ).to_numpy()

    # Bisection on the intercept so the population default rate hits the scenario target.
    low, high = -12.0, 6.0
    for _ in range(50):
        intercept = (low + high) / 2
        rate = sigmoid(intercept + risk + weights["shock"] * shock).mean()
        low, high = (intercept, high) if rate < weights["default_rate"] else (low, intercept)

    true_pd = sigmoid(intercept + risk + weights["shock"] * shock)
    # "Oracle" probability: what a perfect model could know without seeing the unobservable shock.
    frame = frame.copy()
    frame["audit_oracle_risk"] = intercept + risk
    frame["default_12m"] = (rng.random(len(frame)) < true_pd).astype(int)
    return frame


def generate(n, scenario, seed):
    rng = np.random.default_rng(seed)
    return add_outcomes(simulate_applicants(n, rng), scenario, rng)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=60000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", default=str(Path(__file__).parent / "data" / "synthetic_applicants.csv"))
    args = parser.parse_args()

    data = generate(args.rows, "base", args.seed)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(args.out, index=False)
    print(f"{len(data)} rows, default rate {data['default_12m'].mean():.3f} -> {args.out}")
