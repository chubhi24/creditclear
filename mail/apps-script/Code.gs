/**
 * CreditClear report mailer: a Google Apps Script web app that sends the report Lambda builds,
 * from the Gmail account that deploys it.
 *
 * Setup (see mail/README.md):
 *   1. Project Settings → Script properties → add MAIL_SECRET with a long random value.
 *   2. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *   3. Put the /exec URL and the same secret in the Lambda's MAIL_WEBHOOK_URL / MAIL_WEBHOOK_SECRET.
 *
 * "Anyone" only means the URL needs no Google sign-in; requests without the secret are rejected.
 */

var MAX_PER_ADDRESS_PER_HOUR = 5;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty("MAIL_SECRET");
    if (!secret || body.secret !== secret) return reply({ ok: false, error: "unauthorised" });

    var to = String(body.to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return reply({ ok: false, error: "invalid recipient" });
    if (!body.subject || !body.html) return reply({ ok: false, error: "missing subject or body" });

    // Cap mail to any one address, so a scripted client can't flood someone's inbox through the API.
    var cache = CacheService.getScriptCache();
    var key = "sent:" + to.toLowerCase();
    var count = Number(cache.get(key) || 0);
    if (count >= MAX_PER_ADDRESS_PER_HOUR) return reply({ ok: false, error: "rate limited" });

    if (MailApp.getRemainingDailyQuota() < 1) return reply({ ok: false, error: "daily quota used" });

    MailApp.sendEmail({
      to: to,
      subject: String(body.subject).slice(0, 200),
      body: String(body.text || ""),
      htmlBody: String(body.html),
      name: "CreditClear",
    });
    cache.put(key, String(count + 1), 3600);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to grant the send-mail permission and check delivery to yourself.
function testSend() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "CreditClear mailer test", "The mailer is set up.");
}
