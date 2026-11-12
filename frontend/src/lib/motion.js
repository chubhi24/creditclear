import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades and lifts every [data-reveal] element inside `scope`, in DOM order.
 * Re-runs when any value in `deps` changes. Respects reduced motion.
 */
export function useReveal(scope, deps = []) {
  useGSAP(
    () => {
      const items = gsap.utils.toArray("[data-reveal]", scope.current);
      if (!items.length) return;
      if (prefersReducedMotion()) {
        gsap.set(items, { opacity: 1 });
        return;
      }
      gsap.fromTo(
        items,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.07, clearProps: "transform" },
      );
    },
    { scope, dependencies: deps, revertOnUpdate: true },
  );
}

export { gsap, useGSAP };
