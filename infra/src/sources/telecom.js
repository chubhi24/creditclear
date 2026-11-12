/**
 * Prepaid plan crawler. Only the operator the applicant names is fetched.
 * - Jio: public JSON plan API (allowed by jio.com/robots.txt)
 * - Vi: schema.org Product JSON-LD embedded in the recharge page
 * - Airtel, BSNL: their pages render plans client-side, so a dated snapshot is used
 */

const { fetchJson, fetchText, crawl } = require("./http");

const SIX_HOURS = 6 * 60 * 60 * 1000;

const JIO_URL = "https://www.jio.com/api/jio-mdmdata-service/mdmdata/recharge/plans?productType=MOBILITY&billingType=1";
const VI_URL = "https://www.myvi.in/prepaid/online-mobile-recharge";

// Device-locked or travel plans are not a fair baseline for an everyday phone user.
const EXCLUDED_JIO_CATEGORIES = /international|feature phone|isd|in-flight|wi-fi calling|data packs|top-up/i;

const SNAPSHOTS = {
  jio: { asOf: "2026-10-28", value: [{ name: "Rs 189_28D", price: 189, validityDays: 28 }] },
  vi: { asOf: "2026-10-28", value: [{ name: "Vi Truly Unlimited 28 Day", price: 299, validityDays: 28 }] },
  airtel: {
    asOf: "2026-10-28",
    note: "Airtel renders plans in the browser, so this is an approximate snapshot, not live data.",
    value: [{ name: "Airtel unlimited 28 day (approx.)", price: 199, validityDays: 28 }],
  },
  bsnl: {
    asOf: "2026-10-28",
    note: "BSNL renders plans in the browser, so this is an approximate snapshot, not live data.",
    value: [{ name: "BSNL unlimited 28 day (approx.)", price: 199, validityDays: 28 }],
  },
};

const OPERATORS = {
  jio: { label: "Jio prepaid plans", url: JIO_URL, loader: loadJio },
  vi: { label: "Vi prepaid plans", url: VI_URL, loader: loadVi },
  airtel: { label: "Airtel prepaid plans", url: "https://www.airtel.in/recharge-online", loader: null },
  bsnl: { label: "BSNL prepaid plans", url: "https://www.bsnl.co.in/", loader: null },
};

async function loadJio() {
  const json = await fetchJson(JIO_URL);
  const plans = [];
  for (const category of json.planCategories ?? []) {
    if (EXCLUDED_JIO_CATEGORIES.test(category.type ?? "")) continue;
    for (const sub of category.subCategories ?? []) {
      for (const plan of sub.plans ?? []) {
        const description = plan.description ?? "";
        const validity = /Validity\s*[-:]\s*(\d+)\s*Days?/i.exec(description);
        if (!validity || !/voice/i.test(description)) continue;
        plans.push({ name: plan.planName || `Rs ${plan.amount}`, price: Number(plan.amount), validityDays: Number(validity[1]) });
      }
    }
  }
  if (!plans.length) throw new Error("no voice plans parsed from Jio");
  return plans;
}

async function loadVi() {
  const html = await fetchText(VI_URL);
  const products = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node && typeof node === "object") {
      if (node["@type"] === "Product") products.push(node);
      Object.values(node).forEach(visit);
    }
  };
  for (const match of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // Ignore malformed blocks; other blocks may still parse.
    }
  }

  const plans = products
    .map((product) => {
      const validity = (product.additionalProperty ?? []).find((p) => p.name === "Validity");
      const days = /(\d+)\s*day/i.exec(validity?.value ?? "");
      return days ? { name: product.name, price: Number(product.offers?.price), validityDays: Number(days[1]) } : null;
    })
    .filter((plan) => plan && Number.isFinite(plan.price));
  if (!plans.length) throw new Error("no plans parsed from Vi");
  return plans;
}

function monthlyCost(plan) {
  return (plan.price / plan.validityDays) * 30;
}

async function getTelecomPlans(operator) {
  const config = OPERATORS[operator];
  const snapshot = SNAPSHOTS[operator];
  const result = await crawl({
    key: `telecom-${operator}`,
    ttlMs: SIX_HOURS,
    label: config.label,
    url: config.url,
    snapshot,
    loader: config.loader ?? (() => Promise.reject(new Error("no crawlable source"))),
  });

  const plans = result.value.map((plan) => ({ ...plan, monthlyCost: Math.round(monthlyCost(plan)) }));
  // Baseline = cheapest plan bought month to month; long plans need a large upfront payment.
  const monthly = plans.filter((plan) => plan.validityDays <= 31);
  const cheapest = (monthly.length ? monthly : plans).reduce((best, plan) =>
    plan.monthlyCost < best.monthlyCost ? plan : best,
  );
  if (!config.loader) result.source.note = snapshot.note;

  return { value: { operator, planCount: plans.length, cheapest }, source: result.source };
}

module.exports = { getTelecomPlans, OPERATOR_IDS: Object.keys(OPERATORS) };
