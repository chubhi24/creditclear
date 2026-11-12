import { useRef } from "react";
import { Card, Eyebrow } from "../../design/Card";
import { useReveal } from "../../lib/motion";

// Keep in step with CONSENT_VERSION in infra/src/app.js.
const VERSION = "2 November 2026, v2";

const COLLECTED = [
  ["Who you are", "Name and state"],
  ["Income and work", "Monthly income and employment type"],
  ["Housing and bills", "Rent, electricity, water and gas, how often each is paid on time, and for how long"],
  ["Living costs", "Food, transport, medical, education and existing loan EMIs"],
  ["Mobile", "Operator, monthly recharge spend and how often you recharge"],
  ["Credit", "Whether you have borrowed before, and the loan amount and tenure you ask for"],
  ["Email address", "Used once to send your report. It is not saved with your application"],
];

const SECTIONS = [
  {
    title: "Why we use it",
    body: [
      "To calculate your score, check how much you can afford to borrow, build your improvement plan and email you the report. Nothing else: we don’t sell your details or use them for marketing.",
      "Lenders signed in to CreditClear see a summary of each application: first name and last initial, score, band, decision and loan amounts.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "Applications are deleted automatically 90 days after scoring, both from the database and from the stored copy.",
      "Server logs are kept for 14 days. They contain no email addresses, only a masked form such as p***@gmail.com.",
    ],
  },
  {
    title: "Where it is processed",
    body: [
      "Applications are scored and stored on Amazon Web Services (US East region), encrypted at rest. Report emails are sent through Google (Gmail).",
    ],
  },
  {
    title: "Accuracy",
    body: [
      "When you apply, you confirm that your details are true and complete. CreditClear does not yet check them against bank, bureau or identity records, so your score is only as accurate as your answers.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "Consent is your choice. Without it we can’t assess an application, but you can still browse the sample report and plan.",
      "To see, correct or delete your application before the 90 days are up, or to withdraw consent, reply to your report email and include the application ID shown at the bottom of it. We’ll act on it and confirm.",
    ],
  },
];

export function PrivacyPage() {
  const scope = useRef(null);
  useReveal(scope);

  return (
    <div ref={scope} className="mx-auto max-w-3xl">
      <div data-reveal>
        <Eyebrow>Privacy notice</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-tight text-ink md:text-5xl">What we do with your details</h1>
        <p className="mt-5 max-w-xl text-ink-muted">
          In plain terms: what we collect, why, how long we keep it and how to have it removed. This notice follows the
          principles of India’s Digital Personal Data Protection Act, 2023: clear notice, consent, use only for the
          stated purpose, and deletion when no longer needed.
        </p>
      </div>

      <Card data-reveal className="mt-12">
        <h2 className="text-lg font-medium text-ink">What we collect</h2>
        <p className="mt-1 text-sm text-ink-muted">Only what you type into the application form.</p>
        <dl className="mt-5 divide-y divide-line border-y border-line">
          {COLLECTED.map(([term, detail]) => (
            <div key={term} className="grid gap-1 py-3 text-sm sm:grid-cols-[11rem_1fr]">
              <dt className="text-ink">{term}</dt>
              <dd className="text-ink-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {SECTIONS.map((section) => (
        <section key={section.title} data-reveal className="mt-12">
          <h2 className="text-lg font-medium text-ink">{section.title}</h2>
          {section.body.map((para) => (
            <p key={para} className="mt-3 text-sm leading-relaxed text-ink-muted">
              {para}
            </p>
          ))}
        </section>
      ))}

      <p data-reveal className="mt-14 rounded-2xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-ink-muted">
        CreditClear is a student demonstration project, not a regulated lender, and its scores are not lending decisions.
        Notice version: {VERSION}.
      </p>
    </div>
  );
}
