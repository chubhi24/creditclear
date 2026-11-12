import { useEffect, useState } from "react";
import { getMarket } from "../../lib/api";

/** Fetches live market context for the applicant's operator and state. */
export function useMarket(operator, stateCode) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: "" }));
    getMarket({ operator, stateCode }, controller.signal)
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((err) => {
        if (err.name !== "AbortError") setState({ data: null, loading: false, error: err.message });
      });
    return () => controller.abort();
  }, [operator, stateCode]);

  return state;
}
