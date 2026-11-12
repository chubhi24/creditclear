/**
 * Shared fetch + cache helpers for the live data crawlers.
 * Every source is fetched with a short timeout, cached in the warm Lambda,
 * and falls back to a dated snapshot so scoring never blocks on a third party.
 */

const https = require("node:https");
const { constants } = require("node:crypto");

const USER_AGENT = "Mozilla/5.0 (compatible; CreditClearBot/1.0; low-volume, cached)";
const DEFAULT_TIMEOUT_MS = 4000;

// api.mospi.gov.in still requires legacy TLS renegotiation, which Node 18+ refuses.
// This agent is used only for hosts that opt in with { legacyTls: true }.
const legacyTlsAgent = new https.Agent({ secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT });

const cache = new Map();

function fetchTextLegacyTls(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { agent: legacyTlsAgent, headers: { "User-Agent": USER_AGENT }, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${new URL(url).host} responded ${res.statusCode}`));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    request.on("timeout", () => request.destroy(new Error(`${new URL(url).host} timed out`)));
    request.on("error", reject);
  });
}

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, legacyTls = false } = {}) {
  if (legacyTls) return fetchTextLegacyTls(url, timeoutMs);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.9" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${new URL(url).host} responded ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, options));
}

/**
 * Runs `loader` at most once per `ttlMs` for a given key.
 * Returns { value, source } where source records whether the data is live or a snapshot.
 */
async function crawl({ key, ttlMs, label, url, loader, snapshot }) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    return { value: hit.value, source: { ...hit.source, cached: true } };
  }

  try {
    const value = await loader();
    const source = { id: key, label, url, status: "live", fetchedAt: new Date().toISOString() };
    cache.set(key, { at: Date.now(), value, source });
    return { value, source };
  } catch (err) {
    console.log(JSON.stringify({ level: "WARN", event: "crawl.fallback", source: key, message: err.message }));
    return {
      value: snapshot.value,
      source: {
        id: key,
        label,
        url,
        status: "snapshot",
        fetchedAt: snapshot.asOf,
        note: snapshot.note ?? `Live fetch failed (${err.message}); using the snapshot from ${snapshot.asOf}.`,
      },
    };
  }
}

module.exports = { fetchText, fetchJson, crawl };
