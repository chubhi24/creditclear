"""
Trains the CreditClear logistic regression on synthetic data, exports it for the API,
and compares it with XGBoost and the rule formula.
Run: python train.py
"""

import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

from features import (
    EMPLOYMENT_RANK,
    FULL_EVIDENCE_MONTHS,
    LOGISTIC_FEATURES,
    MAX_ESSENTIALS_RATIO,
    MAX_RECHARGE_COVERAGE,
    MONOTONE_CONSTRAINTS,
    ON_TIME_PRIOR,
    build_features,
    build_logistic_features,
    score_from_probability,
)
from generate_data import SCENARIOS, generate

ROOT = Path(__file__).parent
ARTIFACTS = ROOT / "artifacts"
API_MODEL_PATH = ROOT.parent / "infra" / "src" / "model" / "logistic_model.json"
MODEL_VERSION = "lr-1.0.0-simulated"
SEED = 42
ROWS = 60000

XGBOOST_PARAMS = {
    "objective": "binary:logistic",
    "eval_metric": "logloss",
    "max_depth": 3,
    "eta": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 20,
    "lambda": 2.0,
    "monotone_constraints": MONOTONE_CONSTRAINTS,
    "tree_method": "hist",
    "seed": SEED,
}


def ks_statistic(labels, risk):
    order = np.argsort(risk)
    labels = np.asarray(labels)[order]
    bad = np.cumsum(labels) / labels.sum()
    good = np.cumsum(1 - labels) / (1 - labels).sum()
    return float(np.abs(bad - good).max())


def classification_metrics(labels, probability):
    return {
        "auc": roc_auc_score(labels, probability),
        "gini": 2 * roc_auc_score(labels, probability) - 1,
        "ks": ks_statistic(labels, probability),
        "brier": brier_score_loss(labels, probability),
        "log_loss": log_loss(labels, probability),
    }


def band_table(labels, scores):
    scores = np.asarray(scores)
    bands = np.select([scores >= 70, scores >= 50], ["Clear", "Borderline"], "Room to improve")
    table = pd.DataFrame({"band": bands, "default": np.asarray(labels)})
    grouped = table.groupby("band")["default"].agg(["size", "mean"]).reindex(["Clear", "Borderline", "Room to improve"])
    return {
        band: {"share": float(row["size"] / len(table)), "default_rate": float(row["mean"])}
        for band, row in grouped.iterrows()
    }


def run_node(script, frame):
    """Runs a helper against the real API code in infra/src."""
    with tempfile.TemporaryDirectory() as folder:
        inputs, outputs = Path(folder, "in.json"), Path(folder, "out.json")
        frame.to_json(inputs, orient="records")
        subprocess.run(["node", str(ROOT / script), str(inputs), str(outputs)], check=True)
        return np.array(json.loads(outputs.read_text()))


def bootstrap_auc_gain(labels, risk, baseline_risk, rounds=500):
    rng = np.random.default_rng(SEED)
    labels, gains = np.asarray(labels), []
    for _ in range(rounds):
        sample = rng.integers(0, len(labels), len(labels))
        gains.append(roc_auc_score(labels[sample], risk[sample]) - roc_auc_score(labels[sample], baseline_risk[sample]))
    return [float(np.percentile(gains, 2.5)), float(np.percentile(gains, 97.5))]


def export_logistic(scaler, model, rows):
    """Writes the weights the API serves. Refuses a model whose weights point the wrong way."""
    features = []
    for index, (name, direction) in enumerate(LOGISTIC_FEATURES.items()):
        weight = float(model.coef_[0][index])
        if weight * direction <= 0:
            raise ValueError(f"{name} has weight {weight:.3f}, expected sign {direction}")
        features.append({"key": name, "mean": float(scaler.mean_[index]), "scale": float(scaler.scale_[index]), "weight": weight})

    payload = {
        "version": MODEL_VERSION,
        "trainingData": "simulated",
        "trainedRows": rows,
        "intercept": float(model.intercept_[0]),
        "features": features,
        "constants": {
            "onTimePrior": ON_TIME_PRIOR,
            "fullEvidenceMonths": FULL_EVIDENCE_MONTHS,
            "maxEssentialsRatio": MAX_ESSENTIALS_RATIO,
            "maxRechargeCoverage": MAX_RECHARGE_COVERAGE,
            "employmentRank": EMPLOYMENT_RANK,
        },
    }
    API_MODEL_PATH.parent.mkdir(exist_ok=True)
    API_MODEL_PATH.write_text(json.dumps(payload, indent=2) + "\n")


def train_xgboost(X_train, y_train, X_valid, y_valid):
    booster = xgb.train(
        XGBOOST_PARAMS,
        xgb.DMatrix(X_train, y_train),
        num_boost_round=800,
        evals=[(xgb.DMatrix(X_valid, y_valid), "valid")],
        early_stopping_rounds=40,
        verbose_eval=False,
    )
    (ARTIFACTS / "xgboost_challenger.json").unlink(missing_ok=True)
    booster.save_model(ARTIFACTS / "xgboost_challenger.json")
    return booster


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    (ARTIFACTS / "model.json").unlink(missing_ok=True)
    data = generate(ROWS, "base", SEED)
    (ROOT / "data").mkdir(exist_ok=True)
    data.to_csv(ROOT / "data" / "synthetic_applicants.csv", index=False)

    shuffled = np.random.default_rng(SEED).permutation(len(data))
    train_end, valid_end = int(0.6 * len(data)), int(0.8 * len(data))
    train = data.iloc[shuffled[:train_end]]
    valid = data.iloc[shuffled[train_end:valid_end]]
    test = data.iloc[shuffled[valid_end:]]
    y_train, y_test = train["default_12m"], test["default_12m"]

    L_train, L_test = build_logistic_features(train), build_logistic_features(test)
    scaler = StandardScaler().fit(L_train)
    logistic = LogisticRegression(max_iter=2000).fit(scaler.transform(L_train), y_train)
    export_logistic(scaler, logistic, len(train))
    risk_of = lambda frame: logistic.predict_proba(scaler.transform(build_logistic_features(frame)))[:, 1]
    probability = risk_of(test)
    scores = score_from_probability(probability)

    booster = train_xgboost(build_features(train), y_train, build_features(valid), valid["default_12m"])
    xgboost_probability = booster.predict(xgb.DMatrix(build_features(test)), iteration_range=(0, booster.best_iteration + 1))
    formula = run_node("formula_scores.js", test)

    # Leakage check: with shuffled labels there is nothing to learn, so AUC must sit near 0.5.
    noise_labels = np.random.default_rng(SEED).permutation(y_train.to_numpy())
    noise_model = LogisticRegression(max_iter=2000).fit(scaler.transform(L_train), noise_labels)
    shuffled_auc = roc_auc_score(y_test, noise_model.predict_proba(scaler.transform(L_test))[:, 1])

    robustness = {}
    for scenario in SCENARIOS:
        world = generate(12000, scenario, SEED + 7)
        robustness[scenario] = {
            "default_rate": float(world["default_12m"].mean()),
            "model_auc": roc_auc_score(world["default_12m"], risk_of(world)),
            "formula_auc": roc_auc_score(world["default_12m"], -run_node("formula_scores.js", world)),
            "oracle_auc": roc_auc_score(world["default_12m"], world["audit_oracle_risk"]),
            "model_bias_pct_points": float(100 * (risk_of(world).mean() - world["default_12m"].mean())),
        }

    audit = test.assign(score=scores, predicted=probability)
    medical_share = test["medical"] / test["monthly_income"]
    audit["medical_heavy"] = medical_share >= medical_share.quantile(0.9)
    fairness = {}
    for column in ["audit_sector", "audit_household_size", "medical_heavy"]:
        groups = audit.groupby(column).agg(n=("score", "size"), mean_score=("score", "mean"), predicted=("predicted", "mean"), actual=("default_12m", "mean"))
        fairness[column] = {str(key): {k: float(v) for k, v in row.items()} for key, row in groups.iterrows()}

    weights = pd.Series(logistic.coef_[0], index=list(LOGISTIC_FEATURES))
    (ARTIFACTS / "model_card.json").write_text(
        json.dumps(
            {
                "model_version": MODEL_VERSION,
                "model": "logistic regression",
                "status": "Trained on SIMULATED outcomes. Not for real lending decisions.",
                "features": list(LOGISTIC_FEATURES),
                "challenger": {"model": "xgboost", "trees": booster.best_iteration + 1},
            },
            indent=2,
        )
    )

    metrics = {
        "rows": {"train": len(train), "valid": len(valid), "test": len(test)},
        "default_rate_test": float(y_test.mean()),
        "test": {
            "logistic_regression": classification_metrics(y_test, probability),
            "xgboost": classification_metrics(y_test, xgboost_probability),
            "rule_formula_auc": roc_auc_score(y_test, -formula),
            "oracle_auc": roc_auc_score(y_test, test["audit_oracle_risk"]),
        },
        "accuracy": {
            "logistic_at_0.5": accuracy_score(y_test, probability >= 0.5),
            "always_no_default": float(1 - y_test.mean()),
        },
        "auc_gain_over_formula": {
            "point": roc_auc_score(y_test, probability) - roc_auc_score(y_test, -formula),
            "ci95": bootstrap_auc_gain(y_test, probability, -formula),
        },
        "bands": {"logistic_regression": band_table(y_test, scores), "rule_formula": band_table(y_test, formula)},
        "shuffled_label_auc": shuffled_auc,
        "standardised_weights": {name: round(float(value), 4) for name, value in weights.items()},
        "node_python_max_probability_gap": float(np.abs(run_node("model_scores.js", test) - probability).max()),
        "fairness": fairness,
        "robustness": robustness,
    }
    (ARTIFACTS / "metrics.json").write_text(json.dumps(metrics, indent=2, default=float))
    print(json.dumps(metrics, indent=2, default=float))


if __name__ == "__main__":
    main()
