import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../../design/Button";
import { Badge, Card, Eyebrow } from "../../design/Card";
import { getLenderSummary } from "../../lib/api";
import { useReveal } from "../../lib/motion";
import { rupees } from "../../lib/options";
import { useAuth } from "../auth/AuthContext";

const INK = "#111111";
const SAGE = "#6B8F71";
const GRID = "#ECE9E2";
const AXIS = { fill: "#5C5C5C", fontSize: 12 };
const AXIS_FAINT = { fill: "#9A9A9A", fontSize: 11 };

const BAND_LABEL = { clear: "Clear", borderline: "Borderline", improve: "Room to improve" };
const DECISION_LABEL = { eligible: "Eligible", reduced: "Smaller amount", "not-yet": "Not yet" };

const pct = (rate) => `${Math.round(rate * 100)}%`;
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function relativeTime(iso) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function ChartTip({ active, payload, label, unit, labelFormat }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs">
      <p className="text-ink-muted">{labelFormat ? labelFormat(label) : label}</p>
      <p className="mt-0.5 font-medium text-ink">
        {v ?? "—"} {unit}
      </p>
    </div>
  );
}

function Stat({ label, value, detail, accent = false }) {
  return (
    <Card data-reveal>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={`font-display mt-3 text-4xl tabular-nums ${accent ? "text-sage-deep" : "text-ink"}`}>{value}</p>
      {detail ? <p className="mt-2 text-xs text-ink-muted">{detail}</p> : null}
    </Card>
  );
}

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <Card data-reveal className={`min-w-0 ${className}`}>
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      <div className="mt-6 h-56 w-full min-w-0">{children}</div>
    </Card>
  );
}

export function LenderPage() {
  const scope = useRef(null);
  const { idToken } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useReveal(scope, [Boolean(summary)]);

  const load = useCallback(() => {
    if (!idToken) return;
    setLoading(true);
    setError("");
    getLenderSummary(idToken)
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [idToken]);

  useEffect(load, [load]);

  const header = (
    <div data-reveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Eyebrow>Lender view</Eyebrow>
        <h1 className="font-display mt-4 text-4xl leading-tight text-ink md:text-5xl">Portfolio pulse</h1>
        {summary ? (
          <p className="mt-3 text-sm text-ink-muted">
            Live from DynamoDB · updated {relativeTime(summary.generatedAt)}
            {summary.truncated ? " · showing the first 5,000 applications" : ""}
          </p>
        ) : null}
      </div>
      <Button variant="secondary" onClick={load} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );

  if (error) {
    return (
      <div ref={scope}>
        {header}
        <Card className="mt-12">
          <p className="text-sm text-ink">{error}</p>
        </Card>
      </div>
    );
  }

  if (!summary) {
    return (
      <div ref={scope}>
        {header}
        <p className="mt-12 text-sm text-ink-muted" role="status">
          Loading applications…
        </p>
      </div>
    );
  }

  if (!summary.totalApplications) {
    return (
      <div ref={scope}>
        {header}
        <Card className="mt-12">
          <p className="text-sm text-ink">No applications yet.</p>
          <p className="mt-1 text-sm text-ink-muted">
            {summary.localMode
              ? "The local API doesn’t save applications. Point the app at the AWS API to see real data here."
              : "Scored applications will appear here as soon as they are submitted."}
          </p>
        </Card>
      </div>
    );
  }

  const s = summary;
  const decisionCount = Object.fromEntries(s.decisions.map((d) => [d.id, d.count]));
  const employment = s.scoreByEmployment.filter((e) => e.count > 0);

  return (
    <div ref={scope}>
      {header}

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Applications" value={s.totalApplications} detail={`${s.last7Days} in the last 7 days`} />
        <Stat label="Average score" value={s.averageScore} detail="Out of 100" />
        <Stat
          label="Approval rate"
          value={pct(s.approvalRate)}
          detail={`${decisionCount.eligible} full · ${decisionCount.reduced} smaller · ${decisionCount["not-yet"]} not yet${
            s.withDecision < s.totalApplications ? ` · ${s.totalApplications - s.withDecision} older without a decision` : ""
          }`}
          accent
        />
        <Stat label="Offered" value={rupees(s.offeredTotal)} detail={`of ${rupees(s.requestedTotal)} requested`} />
      </div>

      <Card data-reveal className="mt-5">
        <h2 className="text-lg font-medium text-ink">Applications by band</h2>
        <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Share of applications by band">
          {s.bands
            .filter((b) => b.count)
            .map((b) => (
              <div
                key={b.id}
                title={`${BAND_LABEL[b.id]}: ${b.count}`}
                style={{ flexGrow: b.count, background: b.id === "clear" ? SAGE : b.id === "borderline" ? "#9A9A9A" : INK }}
              />
            ))}
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {s.bands.map((b) => (
            <div key={b.id} className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="flex items-center gap-2 text-sm text-ink-muted">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: b.id === "clear" ? SAGE : b.id === "borderline" ? "#9A9A9A" : INK }}
                />
                {BAND_LABEL[b.id]}
              </dt>
              <dd className="text-ink sm:mt-1">
                <span className="font-display text-2xl tabular-nums">{pct(b.rate)}</span>
                <span className="ml-2 text-xs text-ink-muted">{b.count}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Applications per day" subtitle="Last 14 days">
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={s.applicationsPerDay} margin={{ left: 0, right: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_FAINT} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tick={AXIS_FAINT} axisLine={false} tickLine={false} width={28} />
              <Tooltip cursor={{ fill: "rgba(17,17,17,0.03)" }} content={<ChartTip unit="applications" labelFormat={shortDate} />} />
              <Bar dataKey="count" fill={INK} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Score distribution" subtitle="Applications by score range">
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={s.scoreDistribution}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="bucket" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_FAINT} axisLine={false} tickLine={false} width={28} />
              <Tooltip cursor={{ fill: "rgba(17,17,17,0.03)" }} content={<ChartTip unit="applications" />} />
              <Bar dataKey="count" fill={SAGE} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {employment.length ? (
        <Card data-reveal className="mt-5">
          <h2 className="text-lg font-medium text-ink">Average score by employment</h2>
          <p className="mt-1 text-sm text-ink-muted">Out of 100, with the number of applications in each group</p>
          <ul className="mt-6 space-y-4">
            {employment.map((e) => (
              <li key={e.id} className="grid grid-cols-[8rem_1fr_auto] items-center gap-4 text-sm sm:grid-cols-[10rem_1fr_auto]">
                <span className="text-ink-muted">{e.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${e.averageScore}%`, background: INK }} />
                </span>
                <span className="tabular-nums text-ink">
                  {e.averageScore} <span className="text-xs text-ink-muted">· {e.count}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card data-reveal className="mt-5 overflow-x-auto">
        <h2 className="text-lg font-medium text-ink">Recent applications</h2>
        <table className="mt-6 w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              <th className="pb-3 pr-4 font-medium">ID</th>
              <th className="pb-3 pr-4 font-medium">Applicant</th>
              <th className="pb-3 pr-4 text-right font-medium">Score</th>
              <th className="pb-3 pr-4 font-medium">Band</th>
              <th className="pb-3 pr-4 font-medium">Decision</th>
              <th className="pb-3 pr-4 text-right font-medium">Requested</th>
              <th className="pb-3 pr-4 text-right font-medium">Offered</th>
              <th className="pb-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.recent.map((app) => (
              <tr key={app.id}>
                <td className="py-3 pr-4 font-mono text-xs text-ink-faint" title={app.id}>
                  {app.id.slice(0, 4)}…{app.id.slice(-4)}
                </td>
                <td className="py-3 pr-4 text-ink">{app.name}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-ink">{app.score}</td>
                <td className="py-3 pr-4">
                  <Badge tone={app.band === "clear" ? "sage" : "neutral"}>{BAND_LABEL[app.band] ?? app.band}</Badge>
                </td>
                <td className="py-3 pr-4 text-ink-muted">{app.decision ? DECISION_LABEL[app.decision] ?? app.decision : "—"}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-ink-muted">{app.requested ? rupees(app.requested) : "—"}</td>
                <td className="py-3 pr-4 text-right tabular-nums text-ink">{app.offered ? rupees(app.offered) : "—"}</td>
                <td className="py-3 text-ink-muted" title={app.createdAt}>
                  {relativeTime(app.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-6 text-xs text-ink-faint">
        {s.modelScored} of {s.totalApplications} scored by the logistic regression; the rest by the rule-formula
        fallback. Applications are deleted automatically 90 days after scoring.
      </p>
    </div>
  );
}
