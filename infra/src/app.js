const { randomUUID } = require("node:crypto");
const express = require("express");
const cors = require("cors");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { validateApplication } = require("./validate");
const { computeScore } = require("./scoring");
const { deriveSignals, assessEligibility } = require("./eligibility");
const { gatherMarketData } = require("./sources");
const { getTelecomPlans, OPERATOR_IDS } = require("./sources/telecom");
const { getInflation } = require("./sources/inflation");
const { getRepoRate } = require("./sources/rbi");
const { buildReport } = require("./report");
const { sendReport, maskEmail } = require("./mailer");
const { getLenderSummary } = require("./lenderSummary");
const { getCurrentInvoke } = require("@codegenie/serverless-express");

const LENDER_GROUP = "lenders";
// Applications are deleted automatically after this long (DynamoDB TTL and an S3 lifecycle rule).
const RETENTION_DAYS = 90;
// Bump when the privacy notice text changes, so each record shows which version was agreed to.
// v2 adds the declaration that the details are true and complete.
const CONSENT_VERSION = "2026-11-02.v2";

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));

// Strip API Gateway stage prefix if present
app.use((req, _res, next) => {
  if (req.url.startsWith("/prod/")) {
    req.url = req.url.slice(5);
  } else if (req.url === "/prod") {
    req.url = "/";
  }
  next();
});

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region });
const sns = new SNSClient({ region });

function logEvent(event, fields) {
  console.log(JSON.stringify({ level: "INFO", event, ...fields }));
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "creditclear-score" });
});

app.post("/score", async (req, res) => {
  const parsed = validateApplication(req.body);
  if (!parsed.ok) {
    logEvent("score.validation_failed", { errors: parsed.errors });
    return res.status(400).json({ message: "Please check the application details.", errors: parsed.errors });
  }

  const applicationId = randomUUID();
  const createdAt = new Date().toISOString();
  const market = await gatherMarketData(parsed.value);
  const signals = deriveSignals(parsed.value, market);
  const scored = computeScore(parsed.value, signals);
  const eligibility = assessEligibility(parsed.value, market, signals, scored);
  // The email is used once, to send the report, and is not stored (data minimisation).
  const { email, ...stored } = parsed.value;
  const record = {
    applicationId,
    createdAt,
    expiresAt: Math.floor(Date.now() / 1000) + RETENTION_DAYS * 86400,
    consentVersion: CONSENT_VERSION,
    consentedAt: createdAt,
    modelVersion: scored.modelVersion,
    scoringMethod: scored.scoringMethod,
    ...stored,
    score: scored.score,
    band: scored.band.id,
    decision: eligibility.decision.id,
    maxAmount: eligibility.maxAmount,
    annualRatePct: eligibility.annualRatePct,
    topFactors: scored.topFactors,
    sources: market.sources,
  };

  const persistEnabled = process.env.TABLE_NAME && process.env.BUCKET_NAME && process.env.TOPIC_ARN;

  try {
    if (persistEnabled) {
      await ddb.send(
        new PutCommand({
          TableName: process.env.TABLE_NAME,
          Item: record,
        }),
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: `applications/${applicationId}.json`,
          Body: JSON.stringify(record, null, 2),
          ContentType: "application/json",
        }),
      );

      await sns.send(
        new PublishCommand({
          TopicArn: process.env.TOPIC_ARN,
          Subject: `CreditClear: ${scored.band.label} score ${scored.score}`,
          Message: JSON.stringify({
            applicationId,
            score: scored.score,
            band: scored.band.id,
            decision: eligibility.decision.id,
            createdAt,
          }),
        }),
      );
    } else {
      logEvent("score.local_mode", { applicationId });
    }

    const response = {
      applicationId,
      createdAt,
      modelVersion: scored.modelVersion,
      scoringMethod: scored.scoringMethod,
      trainingData: scored.trainingData,
      score: scored.score,
      band: scored.band,
      topFactors: scored.topFactors,
      contributions: scored.contributions,
      plan: scored.plan,
      eligibility,
      sources: market.sources,
    };

    // A failed email never fails the score: the applicant still sees everything on screen.
    const mail = await sendReport({ to: email, ...buildReport(parsed.value, response) });
    logEvent("report.email", { applicationId, to: maskEmail(email), ...mail });

    logEvent("score.completed", {
      applicationId,
      score: scored.score,
      band: scored.band.id,
      decision: eligibility.decision.id,
      scoringMethod: scored.scoringMethod,
      liveSources: market.sources.filter((s) => s.status === "live").length,
      persistEnabled: Boolean(persistEnabled),
    });

    return res.status(200).json({ ...response, email: { to: email, status: mail.status } });
  } catch (err) {
    console.error(JSON.stringify({ level: "ERROR", event: "score.persist_failed", message: err.message }));
    return res.status(500).json({
      message: "We scored the application but could not save it. Please try again in a moment.",
    });
  }
});

// Live context for the intake form: shown as the applicant picks their operator and state.
app.get("/market", async (req, res) => {
  const operator = OPERATOR_IDS.includes(req.query.operator) ? req.query.operator : "jio";
  const stateCode = String(req.query.stateCode ?? "99");
  const [telecom, inflation, repoRate] = await Promise.all([
    getTelecomPlans(operator),
    getInflation(stateCode),
    getRepoRate(),
  ]);
  res.json({
    cheapestPlan: telecom.value.cheapest,
    planCount: telecom.value.planCount,
    inflation: inflation.value,
    repoRatePct: repoRate.value,
    sources: [telecom.source, repoRate.source, inflation.source],
  });
});

// API Gateway has already verified the Cognito JWT; this checks the signed-in user is in the lenders group.
// HTTP APIs pass array claims as a string like "[lenders admins]", so both shapes are handled.
function lenderGroups() {
  const claims = getCurrentInvoke()?.event?.requestContext?.authorizer?.jwt?.claims ?? {};
  const raw = claims["cognito:groups"];
  if (Array.isArray(raw)) return raw;
  return String(raw ?? "")
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .filter(Boolean);
}

function requireLender(req, res, next) {
  // Running locally with `node app.js` there is no API Gateway and no table, so nothing to protect.
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) return next();
  if (lenderGroups().includes(LENDER_GROUP)) return next();
  logEvent("lender.forbidden", { path: req.path });
  return res.status(403).json({ message: "This account is not in the lenders group. Ask an administrator for access." });
}

app.get("/lender/summary", requireLender, async (_req, res, next) => {
  try {
    res.json(await getLenderSummary(ddb, process.env.TABLE_NAME));
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({ level: "ERROR", event: "unhandled", message: err.message }));
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`CreditClear API listening on http://localhost:${port}`);
  });
}
