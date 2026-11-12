// Holds the latest score in memory only. Moving between pages keeps it; refreshing or closing the tab
// clears it, so Explainability and Plan fall back to the sample applicant. Nothing personal is left in storage.
import sample from "./sampleResult.json";

let current = null;

// Older builds kept the result in sessionStorage; remove any copy left behind.
try {
  sessionStorage.removeItem("creditclear:last-result");
} catch {
  // Storage unavailable: nothing to clear.
}

export function saveResult(result) {
  current = result;
}

export function loadResult() {
  return current;
}

export function clearResult() {
  current = null;
}

export const SAMPLE_RESULT = sample;
