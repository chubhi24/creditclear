/**
 * Sends the score report through a Google Apps Script web app (mail/apps-script/Code.gs), which sends it
 * from the Gmail account that deployed the script. Lambda holds no Google credentials: only the web app
 * URL and a shared secret the script checks.
 *
 * Without MAIL_WEBHOOK_URL and MAIL_WEBHOOK_SECRET set, nothing is sent and the status is "not-configured".
 */

const TIMEOUT_MS = 10000;

const maskEmail = (email) => email.replace(/^(.).*?(@.*)$/, "$1***$2");

async function sendReport({ to, subject, html, text }) {
  const url = process.env.MAIL_WEBHOOK_URL;
  const secret = process.env.MAIL_WEBHOOK_SECRET;
  if (!url || !secret) return { status: "not-configured" };

  try {
    // Apps Script answers a POST with a 302 to its result page; fetch follows it as a GET.
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, to, subject, html, text }),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      return { status: "failed", reason: body.error || `HTTP ${res.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", reason: err.name === "TimeoutError" ? "timeout" : err.message };
  }
}

module.exports = { sendReport, maskEmail };
