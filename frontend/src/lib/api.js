const API_URL = import.meta.env.VITE_API_URL;

export async function postScore(payload) {
  if (!API_URL) {
    throw new Error("Missing VITE_API_URL. Copy frontend/.env.example to .env and paste your API Gateway URL.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${API_URL.replace(/\/$/, "")}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.errors?.join(" ") || data.message || "The scoring service could not complete this request.";
      throw new Error(detail);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("The scoring service is taking longer than expected (often a cold start). Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMarket({ operator, stateCode }, signal) {
  if (!API_URL) {
    throw new Error("Missing VITE_API_URL.");
  }
  const params = new URLSearchParams({ operator, stateCode });
  const response = await fetch(`${API_URL.replace(/\/$/, "")}/market?${params}`, { signal });
  if (!response.ok) {
    throw new Error("Live market data is unavailable right now.");
  }
  return response.json();
}

export async function getLenderSummary(idToken) {
  if (!API_URL) {
    throw new Error("Missing VITE_API_URL.");
  }
  const response = await fetch(`${API_URL.replace(/\/$/, "")}/lender/summary`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status === 403) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "This account does not have lender access.");
  }
  if (!response.ok) {
    throw new Error("Could not load the lender dashboard. Sign in again and retry.");
  }
  return response.json();
}
