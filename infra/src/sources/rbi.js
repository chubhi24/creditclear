/**
 * RBI policy repo rate, read from the "Current Rates" table on rbi.org.in.
 * The repo rate anchors the interest rate CreditClear quotes for a loan.
 */

const { fetchText, crawl } = require("./http");

const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const RBI_URL = "https://www.rbi.org.in/";

async function loadRepoRate() {
  const html = await fetchText(RBI_URL, { timeoutMs: 6000 });
  const match = /Policy Repo Rate[\s\S]{0,200}?(\d+(?:\.\d+)?)\s*%/i.exec(html);
  if (!match) throw new Error("repo rate not found on RBI page");
  const rate = Number(match[1]);
  if (rate <= 0 || rate > 20) throw new Error(`implausible repo rate ${rate}`);
  return rate;
}

function getRepoRate() {
  return crawl({
    key: "rbi-repo-rate",
    ttlMs: TWELVE_HOURS,
    label: "RBI policy repo rate",
    url: RBI_URL,
    loader: loadRepoRate,
    snapshot: { asOf: "2026-10-28", value: 5.5 },
  });
}

module.exports = { getRepoRate };
