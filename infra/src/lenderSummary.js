/**
 * Portfolio statistics for the lender dashboard, computed from the applications table.
 * A Scan is fine at demo scale (hundreds of rows); past a few thousand, keep running totals instead.
 */

const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const MAX_ITEMS = 5000;
const DAYS = 14;
const SCORE_BUCKETS = [
  { bucket: "0–49", min: 0, max: 49 },
  { bucket: "50–69", min: 50, max: 69 },
  { bucket: "70–84", min: 70, max: 84 },
  { bucket: "85–100", min: 85, max: 100 },
];
const EMPLOYMENT = [
  ["salaried", "Salaried"],
  ["self-employed", "Self-employed"],
  ["informal", "Informal / gig"],
  ["unemployed", "Not employed"],
];

async function scanApplications(ddb, tableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression:
          "applicationId, createdAt, #n, score, band, decision, maxAmount, loanAmount, employmentType, scoringMethod",
        ExpressionAttributeNames: { "#n": "name" },
        ExclusiveStartKey,
      }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey && items.length < MAX_ITEMS);
  return { items, truncated: Boolean(ExclusiveStartKey) };
}

// "Priya Sharma" → "Priya S." — lenders see enough to recognise a row, not a full identity.
const shortName = (name = "") => {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
};

const share = (n, total) => (total ? n / total : 0);
const round1 = (n) => Math.round(n * 10) / 10;

function summarise(items, now = new Date()) {
  const total = items.length;
  const count = (fn) => items.filter(fn).length;
  const sum = (fn) => items.reduce((acc, it) => acc + (Number(fn(it)) || 0), 0);

  // Applications scored before the eligibility step existed have no decision or loan amount;
  // decision-based figures use only the ones that do.
  const decided = items.filter((it) => it.decision);
  const approved = decided.filter((it) => it.decision === "eligible" || it.decision === "reduced");
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
    return dayKey(d);
  });
  const perDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const it of items) {
    const k = String(it.createdAt ?? "").slice(0, 10);
    if (k in perDay) perDay[k] += 1;
  }
  const weekAgo = now.getTime() - 7 * 864e5;

  return {
    generatedAt: now.toISOString(),
    totalApplications: total,
    last7Days: count((it) => Date.parse(it.createdAt) >= weekAgo),
    averageScore: total ? round1(sum((it) => it.score) / total) : null,
    approvalRate: share(approved.length, decided.length),
    withDecision: decided.length,
    bands: ["clear", "borderline", "improve"].map((id) => ({
      id,
      count: count((it) => it.band === id),
      rate: share(count((it) => it.band === id), total),
    })),
    decisions: ["eligible", "reduced", "not-yet"].map((id) => ({
      id,
      count: count((it) => it.decision === id),
    })),
    requestedTotal: sum((it) => it.loanAmount),
    offeredTotal: approved.reduce((acc, it) => acc + (Number(it.maxAmount) || 0), 0),
    scoreDistribution: SCORE_BUCKETS.map(({ bucket, min, max }) => ({
      bucket,
      count: count((it) => it.score >= min && it.score <= max),
    })),
    applicationsPerDay: days.map((date) => ({ date, count: perDay[date] })),
    scoreByEmployment: EMPLOYMENT.map(([id, label]) => {
      const group = items.filter((it) => it.employmentType === id);
      return {
        id,
        label,
        count: group.length,
        averageScore: group.length ? round1(group.reduce((a, it) => a + it.score, 0) / group.length) : null,
      };
    }),
    modelScored: count((it) => it.scoringMethod === "logistic-regression"),
    recent: [...items]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 10)
      .map((it) => ({
        id: it.applicationId,
        name: shortName(it.name),
        score: it.score,
        band: it.band,
        decision: it.decision,
        requested: it.loanAmount ?? null,
        offered: it.decision ? (it.decision === "not-yet" ? 0 : it.maxAmount) : null,
        createdAt: it.createdAt,
      })),
  };
}

async function getLenderSummary(ddb, tableName) {
  if (!tableName) {
    return { ...summarise([]), localMode: true };
  }
  const { items, truncated } = await scanApplications(ddb, tableName);
  return { ...summarise(items), truncated };
}

module.exports = { getLenderSummary, summarise, shortName };
