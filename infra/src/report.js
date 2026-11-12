/**
 * Builds the emailed score report: score and eligibility, the factor-by-factor breakdown, and the improvement plan.
 * Email clients ignore stylesheets, so the HTML uses tables and inline styles only.
 */

const C = {
  paper: "#F7F5F0",
  surface: "#FFFFFF",
  line: "#ECE9E2",
  ink: "#111111",
  muted: "#5C5C5C",
  faint: "#9A9A9A",
  sage: "#6B8F71",
  sageTint: "#E6EEE7",
  sageDeep: "#557459",
};
const FONT = "font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;";
const SERIF = "font-family:Fraunces,Georgia,'Times New Roman',serif;";
const BAND_LABEL = { clear: "Clear", borderline: "Borderline", improve: "Room to improve" };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const monthsText = (m) => `${m} ${m === 1 ? "month" : "months"}`;

function section(title, body) {
  return `
  <tr><td style="padding:28px 32px 0 32px;">
    <h2 style="${FONT}margin:0 0 14px 0;font-size:17px;font-weight:600;color:${C.ink};">${esc(title)}</h2>
    ${body}
  </td></tr>`;
}

function rows(pairs) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};">
    ${pairs
      .map(
        ([k, v]) => `<tr>
        <td style="${FONT}padding:10px 0;font-size:14px;color:${C.muted};border-bottom:1px solid ${C.line};">${esc(k)}</td>
        <td align="right" style="${FONT}padding:10px 0;font-size:14px;color:${C.ink};border-bottom:1px solid ${C.line};">${esc(v)}</td>
      </tr>`,
      )
      .join("")}
  </table>`;
}

function buildReport(input, result) {
  const { eligibility, band, contributions, plan } = result;
  const eligible = eligibility.decision.id !== "not-yet";
  const firstName = input.name.split(/\s+/)[0];
  const improvable = contributions.filter((c) => c.improve);

  const header = `
  <tr><td style="padding:28px 32px;border-bottom:1px solid ${C.line};">
    <span style="${SERIF}font-size:20px;color:${C.ink};">CreditClear</span>
  </td></tr>
  <tr><td style="padding:32px 32px 0 32px;">
    <p style="${FONT}margin:0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};">Your credit report</p>
    <h1 style="${SERIF}margin:12px 0 0 0;font-size:30px;line-height:1.2;font-weight:400;color:${C.ink};">${esc(eligibility.decision.label)}</h1>
    <p style="${FONT}margin:12px 0 0 0;font-size:15px;line-height:1.6;color:${C.muted};">Hi ${esc(firstName)}, here is your full CreditClear assessment. ${esc(eligibility.decision.detail)}</p>
  </td></tr>
  <tr><td style="padding:24px 32px 0 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border-radius:16px;">
      <tr>
        <td style="padding:24px;" valign="top">
          <p style="${FONT}margin:0;font-size:12px;color:${C.muted};">Score</p>
          <p style="${SERIF}margin:6px 0 0 0;font-size:52px;line-height:1;color:${band.id === "clear" ? C.sageDeep : C.ink};">${result.score}<span style="${FONT}font-size:16px;color:${C.faint};"> / 100</span></p>
          <p style="${FONT}margin:12px 0 0 0;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${band.id === "clear" ? C.sageTint : C.line};color:${band.id === "clear" ? C.sageDeep : C.ink};">${esc(band.label)}</span></p>
        </td>
        <td style="padding:24px;" valign="top" align="right">
          <p style="${FONT}margin:0;font-size:12px;color:${C.muted};">${eligible ? "You can borrow up to" : "Requested"}</p>
          <p style="${SERIF}margin:6px 0 0 0;font-size:32px;color:${C.ink};">${inr(eligible ? eligibility.maxAmount : eligibility.requestedAmount)}</p>
        </td>
      </tr>
    </table>
    <p style="${FONT}margin:14px 0 0 0;font-size:14px;line-height:1.6;color:${C.muted};">${esc(band.detail)}</p>
  </td></tr>`;

  const loan = section(
    "Loan offer",
    rows([
      ["Amount requested", inr(eligibility.requestedAmount)],
      ["Maximum today", inr(eligibility.maxAmount)],
      ["Tenure", monthsText(eligibility.tenureMonths)],
      ["Interest", `${eligibility.annualRatePct}% a year (RBI repo ${eligibility.repoRatePct}% + ${eligibility.lenderSpreadPct}%)`],
      ["EMI on your request", `${inr(eligibility.requestedEmi)} a month`],
      ["Monthly repayment room", `${inr(eligibility.monthlyCapacity)} a month`],
    ]) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      ${eligibility.checks
        .map(
          (c) => `<tr>
          <td valign="top" width="28" style="${FONT}padding:8px 0;font-size:15px;color:${c.passed ? C.sageDeep : C.muted};">${c.passed ? "✓" : "✗"}</td>
          <td style="${FONT}padding:8px 0;">
            <p style="margin:0;font-size:14px;font-weight:600;color:${C.ink};">${esc(c.label)}</p>
            <p style="margin:2px 0 0 0;font-size:13px;line-height:1.5;color:${C.muted};">${esc(c.detail)}</p>
          </td>
        </tr>`,
        )
        .join("")}
    </table>`,
  );

  const explain = section(
    "What moved your score",
    `<p style="${FONT}margin:0 0 14px 0;font-size:13px;line-height:1.6;color:${C.muted};">Points each factor added or removed compared with the average applicant. The model is additive, so these are exact.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="${FONT}padding:0 8px 8px 0;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.line};">Factor</td>
        <td style="${FONT}padding:0 8px 8px 0;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.line};">Your value</td>
        <td align="right" style="${FONT}padding:0 0 8px 0;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.line};">Impact</td>
      </tr>
      ${contributions
        .map(
          (c) => `<tr>
          <td valign="top" style="${FONT}padding:12px 8px 12px 0;border-bottom:1px solid ${C.line};">
            <p style="margin:0;font-size:14px;color:${C.ink};">${esc(c.label)}</p>
            <p style="margin:4px 0 0 0;font-size:12px;line-height:1.5;color:${C.muted};">${esc(c.message)}</p>
          </td>
          <td valign="top" style="${FONT}padding:12px 8px 12px 0;font-size:13px;color:${C.muted};border-bottom:1px solid ${C.line};">${esc(c.value)}</td>
          <td valign="top" align="right" style="${FONT}padding:12px 0;font-size:14px;font-weight:600;color:${c.points > 0 ? C.sageDeep : C.ink};border-bottom:1px solid ${C.line};white-space:nowrap;">${signed(c.points)} pts</td>
        </tr>`,
        )
        .join("")}
    </table>`,
  );

  let planBody = "";
  if (plan?.steps.length) {
    const last = plan.milestones.at(-1);
    const heading = plan.goal
      ? `${plan.reachesGoal ? "Reach" : "Get closer to"} ${plan.goal.label} by month ${last.month}`
      : `Strengthen your offer by month ${last.month}`;
    planBody += `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sageTint};border-radius:16px;">
      <tr><td style="padding:20px 24px;">
        <p style="${FONT}margin:0;font-size:16px;font-weight:600;color:${C.ink};">${esc(heading)}</p>
        <p style="${SERIF}margin:8px 0 0 0;font-size:28px;color:${C.sageDeep};">${plan.currentScore} → ${plan.finalScore}</p>
        <p style="${FONT}margin:8px 0 0 0;font-size:13px;line-height:1.6;color:${C.muted};">Do ${plan.steps.length === 1 ? "this step" : `these ${plan.steps.length} steps at the same time`}:</p>
        <ol style="${FONT}margin:8px 0 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:${C.ink};">
          ${plan.steps.map((s) => `<li>${esc(s.action)} <span style="color:${C.muted};">(${monthsText(s.months)})</span></li>`).join("")}
        </ol>
      </td></tr>
    </table>
    <p style="${FONT}margin:22px 0 8px 0;font-size:14px;font-weight:600;color:${C.ink};">Your timeline</p>
    ${rows([
      ["Now", `Score ${plan.currentScore}`],
      ...plan.milestones.map((m) => [
        `By month ${m.month}: ${m.completes.join(", ").toLowerCase()}`,
        `Expected ${m.expectedScore} · ${BAND_LABEL[m.band]}`,
      ]),
    ])}`;
  }
  if (improvable.length) {
    planBody += `
    <p style="${FONT}margin:22px 0 8px 0;font-size:14px;font-weight:600;color:${C.ink};">Every factor you can improve</p>
    ${improvable
      .map(
        (c) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;margin-bottom:10px;">
        <tr><td style="${FONT}padding:14px 16px;">
          <p style="margin:0;font-size:14px;font-weight:600;color:${C.ink};">${esc(c.label)}${c.projectedScore ? `<span style="font-weight:400;color:${C.sageDeep};"> → ${c.projectedScore}</span>` : ""}</p>
          <p style="margin:6px 0 0 0;font-size:13px;line-height:1.6;color:${C.muted};">${esc(c.improve)}</p>
        </td></tr>
      </table>`,
      )
      .join("")}
    <p style="${FONT}margin:4px 0 0 0;font-size:12px;color:${C.faint};">Each “→” score is that change on its own. The path above combines them.</p>`;
  }
  if (!planBody) {
    planBody = `<p style="${FONT}margin:0;font-size:14px;color:${C.muted};">No factor is holding your score back. Keep paying on time to stay here.</p>`;
  }
  const planSection = section("Your improvement plan", planBody);

  const sources = section(
    "Live data used",
    rows(result.sources.map((s) => [s.label, s.status === "live" ? "Live" : "Snapshot"])),
  );

  const footer = `
  <tr><td style="padding:28px 32px 32px 32px;">
    <p style="${FONT}margin:0;font-size:12px;line-height:1.6;color:${C.faint};">
      ${result.scoringMethod === "logistic-regression"
        ? `Scored by a logistic regression (${esc(result.modelVersion)}) trained on simulated repayment data. This is a demonstration, not a lending decision.`
        : `Scored by the rule formula (${esc(result.modelVersion)}). This is a demonstration, not a lending decision.`}
      Application ${esc(result.applicationId)} · ${new Date(result.createdAt).toUTCString()}.
      You received this because you entered this address on a CreditClear application.
    </p>
  </td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.paper};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${C.surface};border:1px solid ${C.line};border-radius:20px;">
        ${header}${loan}${explain}${planSection}${sources}${footer}
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `CreditClear report for ${input.name}`,
    "",
    `${eligibility.decision.label}. Score ${result.score}/100 (${band.label}).`,
    eligibility.decision.detail,
    "",
    "LOAN OFFER",
    `Requested ${inr(eligibility.requestedAmount)}, maximum today ${inr(eligibility.maxAmount)}, ${monthsText(eligibility.tenureMonths)} at ${eligibility.annualRatePct}%.`,
    ...eligibility.checks.map((c) => `${c.passed ? "[pass]" : "[fail]"} ${c.label}: ${c.detail}`),
    "",
    "WHAT MOVED YOUR SCORE",
    ...contributions.map((c) => `${signed(c.points)} pts  ${c.label} (${c.value})`),
    "",
    "YOUR IMPROVEMENT PLAN",
    ...(plan?.steps.length
      ? [
          `${plan.currentScore} -> ${plan.finalScore}`,
          ...plan.steps.map((s) => `- ${s.action} (${monthsText(s.months)})`),
          ...plan.milestones.map((m) => `By month ${m.month}: expected ${m.expectedScore} (${BAND_LABEL[m.band]})`),
        ]
      : []),
    ...improvable.map((c) => `* ${c.label}${c.projectedScore ? ` -> ${c.projectedScore}` : ""}: ${c.improve}`),
    "",
    `Demonstration only, not a lending decision. Application ${result.applicationId}.`,
  ].join("\n");

  return {
    subject: `Your CreditClear report: score ${result.score} (${band.label})`,
    html,
    text,
  };
}

module.exports = { buildReport };
