/**
 * Consumer price inflation for the applicant's state.
 * 1. MoSPI CPI API, state-level general index (monthly, year-on-year %)
 * 2. World Bank, India CPI inflation (annual) when MoSPI is unreachable
 * 3. Dated snapshot
 */

const { fetchJson, crawl } = require("./http");
const { STATES } = require("./states");

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const ALL_INDIA = "99";

const mospiUrl = (stateCode) =>
  `https://api.mospi.gov.in/api/cpi/getCPIIndex?Format=JSON&limit=1&state_code=${stateCode}&sector_code=3&group_code=0`;
const WORLD_BANK_URL = "https://api.worldbank.org/v2/country/IND/indicator/FP.CPI.TOTL.ZG?format=json&mrnev=1";

async function loadMospi(stateCode) {
  const json = await fetchJson(mospiUrl(stateCode), { legacyTls: true });
  const row = json.data?.[0];
  const rate = Number(row?.inflation);
  if (!row || !Number.isFinite(rate)) throw new Error(`no CPI row for state ${stateCode}`);
  return { rate, region: row.state, period: `${row.month} ${row.year}`, basis: "monthly, year on year" };
}

async function loadWorldBank() {
  const json = await fetchJson(WORLD_BANK_URL);
  const row = json[1]?.[0];
  if (!row || !Number.isFinite(row.value)) throw new Error("no World Bank CPI value");
  return { rate: Number(row.value.toFixed(2)), region: "India", period: row.date, basis: "annual" };
}

async function getInflation(stateCode) {
  const code = STATES[stateCode] ? stateCode : ALL_INDIA;
  const primary = await crawl({
    key: `mospi-cpi-${code}`,
    ttlMs: TWELVE_HOURS,
    label: `MoSPI CPI inflation, ${STATES[code] ?? "All India"}`,
    url: mospiUrl(code),
    loader: () => loadMospi(code),
    snapshot: { asOf: "unavailable", value: null },
  });
  if (primary.value) return primary;

  return crawl({
    key: "worldbank-cpi-india",
    ttlMs: TWELVE_HOURS,
    label: "World Bank CPI inflation, India",
    url: WORLD_BANK_URL,
    loader: loadWorldBank,
    snapshot: {
      asOf: "2026-10-28",
      value: { rate: 1.33, region: "All India", period: "December 2025", basis: "monthly, year on year" },
    },
  });
}

module.exports = { getInflation };
