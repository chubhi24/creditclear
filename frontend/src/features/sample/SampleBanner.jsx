import { Link } from "react-router-dom";
import { Button } from "../../design/Button";

const PERKS = [
  "Your exact score in about 4 minutes",
  "Every factor’s point impact",
  "A month-by-month plan to Clear",
  "The full report emailed to you",
];

// Shown on Explainability and Plan when there is no score in this tab yet, above the sample applicant's data.
export function SampleBanner({ name, score, what }) {
  return (
    <div
      data-reveal
      className="mt-10 overflow-hidden rounded-[var(--radius-soft)] border border-sage/30 bg-sage-tint p-6 md:p-8"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-sage-deep">Sample report</p>
          <h2 className="font-display mt-3 text-3xl leading-tight text-ink">
            This is {name}’s {what}. Yours is four minutes away.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {name} scored {score}. Apply with your own rent, bills and recharges to see where you stand, with no bureau
            file or documents needed.
          </p>
        </div>
        <Link to="/apply" className="shrink-0">
          <Button>Get my score</Button>
        </Link>
      </div>
      <ul className="mt-6 grid gap-x-6 gap-y-2 border-t border-sage/20 pt-5 text-sm text-ink sm:grid-cols-2">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
            {perk}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Closing call to action at the bottom of a sample page.
export function SampleFooterCta({ line }) {
  return (
    <div
      data-reveal
      className="mt-16 rounded-[var(--radius-soft)] border border-line bg-surface px-6 py-12 text-center md:py-14"
    >
      <h2 className="font-display mx-auto max-w-lg text-3xl leading-tight text-ink md:text-4xl">{line}</h2>
      <p className="mx-auto mt-4 max-w-md text-sm text-ink-muted">
        Free, about four minutes, and the full report lands in your inbox.
      </p>
      <Link to="/apply" className="mt-8 inline-block">
        <Button>Start my application</Button>
      </Link>
    </div>
  );
}
