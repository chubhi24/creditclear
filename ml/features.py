"""Turns application columns into model inputs. The same logic must run at serving time."""

import numpy as np
import pandas as pd

# Ordered worst to best, so a monotonic constraint can apply to them.
EMPLOYMENT_RANK = {"unemployed": 0, "informal": 1, "self-employed": 2, "salaried": 3}
LOAN_HISTORY_RANK = {"missed": 0, "none": 1, "repaid": 2}

ESSENTIALS = ["rent", "food", "transport", "electricity", "water_gas", "recharge", "medical", "education", "existing_emi"]

# name -> monotonic direction on default risk (+1 raises risk, -1 lowers risk, 0 unconstrained).
# Medical and education have no feature of their own. They count only inside essentials_ratio,
# so illness or schooling costs are not penalised as categories (fair-lending decision).
FEATURES = {
    "essentials_ratio": 1,
    "rent_ratio": 0,
    "food_ratio": 0,
    "transport_ratio": 0,
    "utilities_ratio": 0,
    "emi_ratio": 1,
    "recharge_coverage": -1,
    "monthly_income": 0,
    "rent_on_time_pct": -1,
    "utility_on_time_pct": -1,
    "rent_months": -1,
    "utility_months": -1,
    "employment_rank": -1,
    "loan_history_rank": -1,
}

MONOTONE_CONSTRAINTS = "(" + ",".join(str(direction) for direction in FEATURES.values()) + ")"


def build_features(frame):
    income = frame["monthly_income"].clip(lower=1)
    features = pd.DataFrame(index=frame.index)
    features["essentials_ratio"] = frame[ESSENTIALS].sum(axis=1) / income
    features["rent_ratio"] = frame["rent"] / income
    features["food_ratio"] = frame["food"] / income
    features["transport_ratio"] = frame["transport"] / income
    features["utilities_ratio"] = (frame["electricity"] + frame["water_gas"]) / income
    features["emi_ratio"] = frame["existing_emi"] / income
    features["recharge_coverage"] = (frame["recharge"] / frame["operator_baseline"]).clip(upper=4)
    features["monthly_income"] = frame["monthly_income"]
    features["rent_on_time_pct"] = frame["rent_on_time_pct"]
    features["utility_on_time_pct"] = frame["utility_on_time_pct"]
    features["rent_months"] = frame["rent_months"]
    features["utility_months"] = frame["utility_months"]
    features["employment_rank"] = frame["employment_type"].map(EMPLOYMENT_RANK).astype(float)
    features["loan_history_rank"] = frame["loan_history"].map(LOAN_HISTORY_RANK).astype(float)
    return features[list(FEATURES)]


# Production model. Every expense column feeds essentials_ratio, so a rupee of food,
# medical or rent counts the same. Direction: +1 raises default risk, -1 lowers it.
LOGISTIC_FEATURES = {
    "essentials_ratio": 1,
    "recharge_coverage": -1,
    "rent_on_time_evidence": -1,
    "utility_on_time_evidence": -1,
    "rent_months": -1,
    "utility_months": -1,
    "employment_rank": -1,
    "new_borrower": 1,
    "missed_payments": 1,
}

# Short histories are pulled toward a neutral on-time rate, reaching full weight at 12 months.
ON_TIME_PRIOR = 75
FULL_EVIDENCE_MONTHS = 12
MAX_ESSENTIALS_RATIO = 1.5
MAX_RECHARGE_COVERAGE = 4


def on_time_evidence(on_time_pct, months):
    return ON_TIME_PRIOR + (on_time_pct - ON_TIME_PRIOR) * (months / FULL_EVIDENCE_MONTHS).clip(upper=1)


def build_logistic_features(frame):
    income = frame["monthly_income"].clip(lower=1)
    features = pd.DataFrame(index=frame.index)
    features["essentials_ratio"] = (frame[ESSENTIALS].sum(axis=1) / income).clip(upper=MAX_ESSENTIALS_RATIO)
    features["recharge_coverage"] = (frame["recharge"] / frame["operator_baseline"]).clip(upper=MAX_RECHARGE_COVERAGE)
    features["rent_on_time_evidence"] = on_time_evidence(frame["rent_on_time_pct"], frame["rent_months"])
    features["utility_on_time_evidence"] = on_time_evidence(frame["utility_on_time_pct"], frame["utility_months"])
    features["rent_months"] = frame["rent_months"]
    features["utility_months"] = frame["utility_months"]
    features["employment_rank"] = frame["employment_type"].map(EMPLOYMENT_RANK).astype(float)
    features["new_borrower"] = (frame["loan_history"] == "none").astype(float)
    features["missed_payments"] = (frame["loan_history"] == "missed").astype(float)
    return features[list(LOGISTIC_FEATURES)]


def score_from_probability(probability):
    """
    Maps default probability to CreditClear's 1-99 scale, keeping the existing bands:
    score 70 (Clear) at 10% default risk and score 50 (Borderline) at 25%.
    These cut-offs are a risk-appetite assumption for a lender to confirm.
    """
    p = np.clip(probability, 1e-6, 1 - 1e-6)
    good_odds = np.log((1 - p) / p)
    slope = np.log(0.7 / 0.3) / (np.log(9) - np.log(3))
    return np.clip(np.round(100 / (1 + np.exp(-slope * (good_odds - np.log(3))))), 1, 99)
