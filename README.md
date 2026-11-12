# CreditClear

Explainable micro-credit scoring for thin-file borrowers. Applicants submit rent, utility, income, mobile-recharge and loan history instead of a bureau score. At scoring time the API crawls live market data chosen by the applicant's answers, then returns a 0–100 score, every factor's exact point impact, a loan eligibility decision, and stores the application on AWS.

This repo is split on purpose: **`frontend/`** is the React app; **`infra/`** is the SAM/Express cloud stack.

**Live site:** <https://d1jt51uy02drli.cloudfront.net> (the stack's `SiteUrl` output).

## What is live vs placeholder

| Surface | Status |
| --- | --- |
| Multi-step applicant intake + scoring + eligibility | **Live** — `POST /score` |
| Live market data crawl (plans, repo rate, inflation) | **Live** — also previewed in the form via `GET /market` |
| Score result, eligibility checks, data sources | **Live** |
| Explainability (exact per-factor points, what-if scores) | **Live** |
| Improvement plan from the applicant's own factors | **Live** |
| DynamoDB + S3 snapshot + SNS notify + CloudWatch logs/alarm | **Live** after `sam deploy` |
| Cognito sign-in | **Live**; admin-created accounts only, `lenders` group required |
| Lender dashboard | **Live** from DynamoDB, behind Cognito and the `lenders` group |
| Public website | **Live** on S3 + CloudFront over HTTPS |
| SageMaker | **Not used** (avoids hourly endpoint cost) |

## Live data sources

Crawled per request in parallel (4–6 s timeout each), cached in the warm Lambda for 6–12 hours, and each falls back to a dated snapshot so scoring never blocks. The result screen shows each source as **Live** or **Snapshot**.

| Data | Source | Picked by |
| --- | --- | --- |
| Prepaid plans (cheapest ≤31-day plan = recharge baseline) | Jio public plan API; Vi page JSON-LD; Airtel/BSNL approximate snapshot (their pages render client-side) | Applicant's operator |
| Policy repo rate → loan rate (repo + 16% spread) | rbi.org.in "Current Rates" | — |
| CPI inflation → inflates rent, bills, recharge | MoSPI CPI API (state, monthly); World Bank India CPI as fallback | Applicant's state |

`api.mospi.gov.in` requires legacy TLS renegotiation, which Node 18+ refuses, so [`sources/http.js`](infra/src/sources/http.js) enables it for that host only.

## Scoring model

The score comes from a **logistic regression** trained in [`ml/`](ml/README.md) and served by [`infra/src/riskModel.js`](infra/src/riskModel.js). The weights live in `infra/src/model/logistic_model.json`, so no ML runtime is needed in Lambda. If the model can't load or score, [`scoringFormula.js`](infra/src/scoringFormula.js) (the earlier rule formula) takes over, and the response's `scoringMethod` says which ran.

> The model was trained on **simulated** repayment outcomes. It demonstrates the pipeline and must be retrained on real loan outcomes before any lending decision.

- **Inputs:** essentials ÷ income (rent, food, transport, electricity, water and gas, recharge, medical, education and existing EMIs, inflated by the state's live CPI); rent and bill on-time rates; months of each history; employment; loan history; recharge ÷ cheapest live plan.
- **Equal treatment of expenses:** every rupee of essentials counts the same, so medical and education are never penalised as categories.
- **Thin histories:** on-time rates under 12 months are pulled toward neutral, so one perfect month counts less than a year.
- **New borrowers start lower:** for the sample applicant, scores are 72 with no loans, 84 with a repaid loan and 63 with missed payments.
- **Safe direction:** training fails if any weight points the wrong way.
- **Bands:** **70+** Clear (about 10% default risk at the cut-off) · **50–69** Borderline · **below 50** Room to improve. Age is not scored.

Every factor is returned with its exact point impact against the average applicant and, where it held the score back, advice written in the applicant's own numbers plus the projected score if improved.

The response also carries a `plan`. Steps run in parallel, so the API finds the earliest month by which the applicant can reach Clear (score 70), then drops any step that isn't needed. Each milestone month comes with the score the model expects on re-applying then. Applicants already Clear get the steps that strengthen their offer within 6 months. The rule-formula fallback returns no plan, and the page then shows a generic timeline.

## Email report and sample pages

- **Email report.** The form asks for an email address. After scoring, the full report (score, loan offer, every factor's points, improvement plan and timeline) is emailed through a Google Apps Script mailer. Setup is in [`mail/README.md`](mail/README.md). Email is off until `MAIL_WEBHOOK_URL` and `MAIL_WEBHOOK_SECRET` are set.
- **Sample pages.** The result is kept in memory only, so it survives moving between pages but not a refresh. Explainability and Plan then show a sample applicant (`frontend/src/lib/sampleResult.json`, captured from the real API) with a prompt to apply.

## Privacy, access and limits

- **Consent.** The Review step has a required consent checkbox linked to the privacy notice (`/privacy`). The API rejects applications without `consent: true`, and each record stores `consentVersion` and `consentedAt`.
- **Retention.** Records carry `expiresAt`, 90 days after scoring. DynamoDB TTL deletes them, and an S3 lifecycle rule deletes the matching `applications/` copies. Email addresses are never stored.
- **Lender access.** Cognito self sign-up is off, so an administrator creates every account. `/lender/summary` needs a valid JWT and membership of the `lenders` group. Add a user with `aws cognito-idp admin-add-user-to-group --user-pool-id USER_POOL_ID --username EMAIL --group-name lenders`.
- **Throttling.** Every API route is limited to 5 requests a second, with bursts of 10. Extra calls get HTTP 429 before Lambda runs.
- **Lender dashboard.** It reads the applications table (`infra/src/lenderSummary.js`) and shows volume, average score, approval rate, amount offered, band split, applications per day, score distribution, average score by employment, and the 10 latest applications by first name and last initial.

## Eligibility

[`infra/src/eligibility.js`](infra/src/eligibility.js): the new EMI at the live rate plus existing EMIs must fit within 50% of income (RBI microfinance framework, 2022), and the new EMI within 60% of the monthly surplus; Borderline scores get 75% of that room; recharge spend below the cheapest live plan halves the offer. The decision is Eligible, Eligible for a smaller amount (with the maximum), or Not yet.

## Prerequisites

- Node.js 22+
- AWS CLI configured for **us-east-1**
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

## Deploy the AWS stack

```bash
cd infra
sam build
sam deploy --guided
```

Suggested guided answers:

- Stack name: `creditclear`
- Region: `us-east-1`
- Confirm IAM role creation: **Y**
- Disable rollback: **N**
- Save arguments to `samconfig.toml`: **Y**

After deploy, copy stack outputs:

```bash
aws cloudformation describe-stacks --stack-name creditclear --region us-east-1 --query "Stacks[0].Outputs"
```

You need `ApiUrl`, `UserPoolId`, and `UserPoolClientId`.

### Create a lender test user

```bash
aws cognito-idp admin-create-user --region us-east-1 --user-pool-id USER_POOL_ID --username lender@example.com --user-attributes Name=email,Value=lender@example.com Name=email_verified,Value=true --message-action SUPPRESS

aws cognito-idp admin-set-user-password --region us-east-1 --user-pool-id USER_POOL_ID --username lender@example.com --password 'ChangeMe123' --permanent
```

Optional: in the SNS console, subscribe your email to `NotifyTopicArn` and confirm the subscription. Each scored application then pings you.

## Point the frontend at AWS

```bash
cd frontend
cp .env.example .env
```

Edit `.env`:

```
VITE_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxx
VITE_AWS_REGION=us-east-1
```

`VITE_API_URL` is the `ApiUrl` output with **no trailing `/score`**.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Intake is public. Lender requires sign-in.

## Publish the website

The stack creates a private S3 bucket and a CloudFront distribution in front of it. To build the React app and upload it (with `frontend/.env` pointing at the AWS API):

```powershell
powershell -ExecutionPolicy Bypass -File infra\scripts\deploy-site.ps1
```

The script uploads the hashed `assets/` files with a one-year cache and `index.html` with `no-cache`, then refreshes CloudFront's copy of `index.html`, so new versions appear within a minute. Run it after every frontend change.

- **The bucket is never public.** Only this CloudFront distribution can read it, through an origin access control.
- **Page links work.** Links like `/plan` or `/lender`, and refreshes on them, serve `index.html` so React Router can render the page.
- **The API accepts the site.** The site's address is in the API's CORS list.

## Local API (optional, no AWS writes)

```bash
cd infra/src
npm install
node app.js
```

Then set `VITE_API_URL=http://localhost:3001`. If DynamoDB/S3/SNS env vars are unset, scoring still returns a result (local mode).

## Shutdown / cost

There is **no SageMaker endpoint**. Lambda, API Gateway, DynamoDB, S3, SNS, CloudWatch, Cognito and CloudFront stay inside the free allowances at this demo scale. CloudFront's always-free tier is 1 TB and 10 million requests a month, and the site is under 1 MB.

The stack also creates an **AWS Budgets alert** (`creditclear-monthly-1-usd`). It emails `BudgetAlertEmail` if the account's monthly bill passes, or is forecast to pass, USD 1.

To remove the stack after the review:

```bash
cd infra
sam delete --stack-name creditclear --region us-east-1
```

Empty the S3 applications and site buckets first if CloudFormation cannot delete them.

## Architecture (interim)

React (Vite, Tailwind, GSAP), served from S3 through CloudFront → Amazon API Gateway HTTP API → Lambda (Express, Node.js 22) → live crawl (operator plans, RBI, MoSPI/World Bank) → scoring + eligibility, then DynamoDB `PutItem`, S3 `PutObject`, SNS `Publish`. Cognito JWT authorizer plus a `lenders` group check on `GET /lender/summary`; Gmail via Apps Script for report emails.

