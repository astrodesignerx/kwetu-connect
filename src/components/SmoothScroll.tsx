"use client";

import { useEffect } from "react";
import Lenis from "lenis";
// Lenis' own stylesheet — sets `html.lenis body { height: auto }` (so the scroll
// limit is computed correctly) and disables pointer events on iframes (so the
// embedded map doesn't hijack the wheel). Without it, scrolling gets stuck.
import "lenis/dist/lenis.css";

let lenisInstance: Lenis | null = null;

export function getLenis() {
  return lenisInstance;
}

export default function SmoothScroll() {
  useEffect(() => {
    // Honor reduced-motion: skip smooth scroll and let the browser scroll natively.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      smoothWheel: true,
    });

    lenisInstance = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      // Schedule the NEXT frame first. If lenis.raf() ever throws on a transient
      // DOM state, the loop keeps running and self-heals — instead of dying
      // permanently and freezing the page until a manual refresh.
      rafId = requestAnimationFrame(raf);
      lenis.raf(time);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);

  return null;
}
