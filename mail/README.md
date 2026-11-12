# Emailing score reports through Gmail

After scoring, the Lambda builds an HTML report (`infra/src/report.js`): score, loan offer and checks, every factor's points, the improvement plan and timeline, and the data sources. It then posts the report to a small **Google Apps Script** web app (`apps-script/Code.gs`), which sends it from your Gmail account.

```
Lambda ──POST {secret, to, subject, html}──▶ Apps Script web app ──MailApp──▶ applicant's inbox
```

## Why Apps Script instead of the Gmail API

| | Apps Script web app (used) | Gmail API |
| --- | --- | --- |
| Google credentials in AWS | None; only a URL and a shared secret | An OAuth client and a refresh token stored in Lambda |
| Setup | Paste one file and deploy | Create a Cloud project, consent screen and OAuth flow |
| Sends from | Your Gmail | Your Gmail |
| Free limit | 100 recipients a day (personal Gmail) | Similar Gmail sending limits |

For production volume, Amazon SES is the AWS-native choice. It needs a verified domain and production access.

## Set it up (about 5 minutes)

1. Go to <https://script.google.com>, signed in as the Gmail account that should send the reports, and create a **New project** called `CreditClear mailer`.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs) and save.
3. Make a secret, for example with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
4. Open **Project Settings → Script properties → Add script property**. Name it `MAIL_SECRET` and paste the secret as its value.
5. Select `testSend` in the toolbar and click **Run**. Approve the permission prompt ("Send email as you"). You should get a test email.
6. Click **Deploy → New deployment → type: Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**. This lets Lambda call it without signing in; requests without the secret are rejected.
7. Copy the **Web app URL**, which ends in `/exec`.

### Use it locally

```bash
cd infra/src
MAIL_WEBHOOK_URL="https://script.google.com/macros/s/.../exec" MAIL_WEBHOOK_SECRET="your-secret" node app.js
```

### Use it on AWS

```bash
cd infra
sam build
sam deploy --parameter-overrides MailWebhookUrl="https://script.google.com/macros/s/.../exec" MailWebhookSecret="your-secret"
```

Without these settings, nothing is sent: the result screen says email reports are off for the server, and the score still works.

## Safeguards

- **A failed email never fails the score.** The response's `email.status` is `sent`, `failed` or `not-configured`, and the result screen shows which.
- **Logs mask the address**, for example `p***@example.com`.
- **The script checks the secret** and caps mail at 5 per address per hour, so the public `/score` endpoint can't flood someone's inbox. It also stops at Gmail's daily quota.
- **The email is not stored.** It is used once to send the report and left out of the DynamoDB and S3 records.
- **API Gateway throttling** (5 requests a second, bursts of 10) limits how fast `/score` can be called at all.
