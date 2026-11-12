# CreditClear ML pipeline

Trains the logistic regression the API serves, and compares it with an XGBoost challenger and the rule formula.

> **Status: trained on simulated outcomes.** This proves the pipeline works. It does not show that the model predicts real repayment, and it must not make real lending decisions.

## Run it

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python train.py
```

Node.js is required. Training:

1. Writes the served weights to `infra/src/model/logistic_model.json`, and fails if any weight points the wrong way.
2. Runs the comparison through the real formula code in `infra/src`.
3. Checks that the JavaScript model matches Python.

Results go to `artifacts/metrics.json`. After retraining, redeploy with `sam build && sam deploy`.

## Data

No public dataset links these Indian expense columns to loan repayment, so 60,000 applicants are simulated in `generate_data.py`.

| Part | Basis |
| --- | --- |
| Per-capita spend; food, fuel and light, conveyance, medical and education shares | Observed: [MoSPI HCES 2023-24 press note](https://www.mospi.gov.in/sites/default/files/press_release/HCES_Press_Note_2023-24_27122024_rev.pdf) |
| Cheapest plan cost per operator | Observed for Jio and Vi, approximate for Airtel and BSNL (app crawl, October 2026) |
| Rent, household size, income, savings, existing EMIs, employment mix | Assumed |
| Default rate (15%) and every risk weight | Assumed |

## The served model

The model has 9 inputs, built in `features.py` (`build_logistic_features`) and mirrored in `infra/src/riskModel.js`:

- **Budget:** essentials ÷ income. All nine expense columns feed this one ratio, so every rupee counts the same and medical and education are never penalised as categories.
- **Payment records:** rent and bill on-time rates, pulled toward a neutral 75% until there are 12 months of history; months of rent and bill history.
- **Other:** employment rank; new borrower; missed payments on an earlier loan; recharge ÷ cheapest live plan.

I tried an earlier 14-input version with separate expense shares. It gave the existing-EMI share the wrong sign, because EMIs are already inside total essentials, and it scored only marginally higher.

## Results

Held-out test set of 12,000 applicants, 15.1% defaulting.

| Model | AUC |
| --- | --- |
| Best achievable here (knows the hidden payment-discipline trait) | 0.789 |
| XGBoost challenger (14 inputs) | 0.771 |
| **Logistic regression, served (9 inputs)** | **0.767** |
| Rule formula, fallback | 0.744 |

The logistic regression's AUC gain over the formula is 0.023 (95% CI 0.017 to 0.030). Accuracy is 85.7%, but always predicting "no default" scores 84.9%, so accuracy says little here.

| Band | Share of applicants | Defaults |
| --- | --- | --- |
| Clear | 50% | 5.7% |
| Borderline | 34% | 16.7% |
| Room to improve | 16% | 41.3% |

## Checks

| Check | Result |
| --- | --- |
| Shuffled labels | AUC 0.52 (no leakage) |
| Every weight points the safe way | Enforced at export |
| JavaScript model matches Python | Max probability gap 3×10⁻¹⁶ |
| Rural vs urban predicted vs actual defaults | Within 0.4 points |
| Top 10% medical spenders | Mean score 2.9 lower, through their budget ratio |
| 25% default-rate world | AUC holds at 0.760; predictions run 10 points too low |

## Limits

- **The comparison is circular.** The same assumptions created the outcomes, so the gain over the formula is not evidence the model would beat it on real loans.
- **The band cut-offs are assumptions.** Score 70 maps to 10% default risk and score 50 to 25%, which a lender must confirm.
- **It needs recalibrating if defaults shift**, as the 25% world shows.
- **Only real repayment outcomes can validate it.**
