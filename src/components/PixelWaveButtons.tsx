"use client";

import { useEffect, useRef } from "react";

/**
 * Global "LED pixel-wave" button hover.
 *
 * Mounted once (like SmoothScroll). Uses event delegation so it covers every
 * current and future `.btn-sweep` / `.btn-outline` / `.btn-lift` button without
 * touching any button markup. On hover it draws a grid of small square pixels
 * onto one fixed, non-interactive canvas, clipped to the hovered pill. Each
 * pixel's tone follows a phase-shifted sine field with per-cell noise, so the
 * wave drifts organically rather than pulsing in sync.
 *
 * Pixels are coloured along a light↔deep-gold ramp (not a single colour with a
 * blend mode) so the ripple stays visible on gold, black AND white buttons.
 */

const SELECTOR = ".btn-sweep, .btn-outline, .btn-lift";

const CELL = 7; // px per pixel cell
const GAP = 1; // px grid line between cells
const SPATIAL = 0.022; // spatial frequency of the wave
const SPEED = 3.2; // temporal speed
const ANGLE = (20 * Math.PI) / 180; // shared wave direction
const DIR_X = Math.cos(ANGLE);
const DIR_Y = Math.sin(ANGLE);
const TAU = Math.PI * 2;

// Tonal gold stops: deep bronze ↔ light gold.
const DEEP = [138, 94, 18]; // #8a5e12  (--color-brand-700)
const LIGHT = [246, 207, 138]; // #f6cf8a

// Cheap deterministic per-cell hashes (classic fract(sin) noise).
function hash(i: number, j: number) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function hash2(i: number, j: number) {
  const s = Math.sin(i * 269.5 + j * 183.3) * 24634.6345;
  return s - Math.floor(s);
}

export default function PixelWaveButtons() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Checked live on each interaction (not once at mount) so it stays correct
    // if the OS setting is toggled after load.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // work in CSS px
    };
    resize();
    window.addEventListener("resize", resize);

    let active: HTMLElement | null = null;
    let envelope = 0; // 0 = hidden, 1 = fully shown
    let start = 0;
    let rafId = 0;
    let running = false;

    const supportsRoundRect = typeof ctx.roundRect === "function";

    const draw = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000;

      // Ease the envelope toward its target (1 while hovered, else 0).
      const target = active ? 1 : 0;
      envelope += (target - envelope) * 0.12;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (!active && envelope < 0.01) {
        running = false;
        return; // idle: stop the loop entirely
      }

      if (active) {
        const rect = active.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          ctx.save();
          ctx.beginPath();
          const r = Math.min(rect.height / 2, rect.width / 2);
          if (supportsRoundRect) {
            ctx.roundRect(rect.left, rect.top, rect.width, rect.height, r);
          } else {
            ctx.rect(rect.left, rect.top, rect.width, rect.height);
          }
          ctx.clip();

          const cols = Math.ceil(rect.width / CELL);
          const rows = Math.ceil(rect.height / CELL);
          // Leading wavefront sweeps in over the first ~0.35s on enter.
          const front = Math.min(1, t / 0.35);

          for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
              const x = i * CELL;
              const y = j * CELL;
              const phase = (x * DIR_X + y * DIR_Y) * SPATIAL;
              const noise = hash(i, j) * TAU;
              const jitter = 1 + 0.15 * (hash2(i, j) - 0.5);
              const v = Math.sin(phase - t * SPEED * jitter + noise); // -1..1
              const m = 0.5 + 0.5 * v; // 0..1

              // Column reveal so the wave visibly arrives from the left.
              const colGate = Math.min(1, Math.max(0, front * cols - i + 1));
              const alpha = envelope * colGate * (0.1 + 0.18 * m);
              if (alpha < 0.012) continue;

              const rr = Math.round(DEEP[0] + (LIGHT[0] - DEEP[0]) * m);
              const gg = Math.round(DEEP[1] + (LIGHT[1] - DEEP[1]) * m);
              const bb = Math.round(DEEP[2] + (LIGHT[2] - DEEP[2]) * m);
              ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha})`;
              ctx.fillRect(rect.left + x, rect.top + y, CELL - GAP, CELL - GAP);
            }
          }
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    const kick = () => {
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(draw);
      }
    };

    const setActive = (el: HTMLElement | null) => {
      if (el === active) return;
      active = el;
      if (el) {
        start = 0; // restart the wavefront for the new button
        kick();
      }
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch" || reduceMotion.matches) return;
      const btn = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (btn) setActive(btn);
    };
    const onOut = (e: PointerEvent) => {
      if (!active) return;
      const to = e.relatedTarget as Node | null;
      if (to && active.contains(to)) return; // moving between children
      setActive(null);
    };
    // Keyboard parity.
    const onFocusIn = (e: FocusEvent) => {
      if (reduceMotion.matches) return;
      const btn = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (btn) setActive(btn);
    };
    const onFocusOut = () => setActive(null);

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 60,
      }}
    />
  );
}
