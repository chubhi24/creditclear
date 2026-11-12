export function Card({ children, className = "", ...props }) {
  return (
    <div className={`rounded-[var(--radius-soft)] border border-line bg-surface p-6 md:p-8 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className = "" }) {
  return <p className={`text-xs font-medium uppercase tracking-[0.16em] text-ink-muted ${className}`}>{children}</p>;
}

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-paper text-ink-muted border border-line",
    sage: "bg-sage-tint text-sage-deep",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** Live / snapshot marker for crawled data. */
export function SourceStatus({ source }) {
  const live = source.status === "live";
  const when = live
    ? new Date(source.fetchedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : source.fetchedAt;
  return (
    <Badge tone={live ? "sage" : "neutral"}>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-sage" : "bg-ink-faint"}`} />
      {live ? `Live · ${when}` : `Snapshot · ${when}`}
    </Badge>
  );
}
