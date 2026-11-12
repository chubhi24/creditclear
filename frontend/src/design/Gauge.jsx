import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../lib/motion";

const RADIUS = 88;
const ARC = Math.PI * RADIUS;

export function Gauge({ score = 0, band = "clear" }) {
  const scope = useRef(null);
  const arcRef = useRef(null);
  const numberRef = useRef(null);
  // Sage marks a clear result; other bands stay neutral ink — never red.
  const color = band === "clear" ? "var(--color-sage)" : "var(--color-ink)";

  useGSAP(
    () => {
      const state = { value: 0 };
      const render = () => {
        arcRef.current.style.strokeDasharray = `${(state.value / 100) * ARC} ${ARC}`;
        numberRef.current.textContent = String(Math.round(state.value));
      };
      if (prefersReducedMotion()) {
        state.value = score;
        render();
        return;
      }
      gsap.to(state, { value: score, duration: 1.6, ease: "power2.out", delay: 0.2, onUpdate: render });
    },
    { scope, dependencies: [score] },
  );

  return (
    <div ref={scope} className="mx-auto flex w-full max-w-xs flex-col items-center">
      <svg viewBox="0 0 220 124" className="w-full" aria-hidden="true">
        <path d="M22 116 A88 88 0 0 1 198 116" fill="none" stroke="var(--color-line)" strokeWidth="10" strokeLinecap="round" />
        <path
          ref={arcRef}
          d="M22 116 A88 88 0 0 1 198 116"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          style={{ strokeDasharray: `0 ${ARC}` }}
        />
      </svg>
      <p className="-mt-16 font-display text-6xl font-normal tabular-nums text-ink" aria-label={`Score ${score} out of 100`}>
        <span ref={numberRef}>0</span>
      </p>
      <p className="mt-1 text-xs text-ink-muted">out of 100</p>
    </div>
  );
}
