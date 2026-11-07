"use client";

import { useEffect, useRef } from "react";

export function LightField({ words = false }: { words?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const base = document.createElement("canvas");
    const mask = document.createElement("canvas");
    let width = 0, height = 0, frame = 0;
    let dots: { x: number; y: number; word: boolean }[] = [];
    const pointer = { x: -1000, y: -1000 };
    let disposed = false;
    const start = performance.now();

    function draw(now: number) {
      const ctx = context!;
      const time = reduced.matches ? 4 : (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(base, 0, 0, width, height);
      const lights = [
        { x: width * (.48 + .38 * Math.sin(time * .12)), y: height * (.5 + .27 * Math.cos(time * .16)), r: width * .42, colour: [251, 176, 64] },
        { x: width * (.5 + .4 * Math.cos(time * .09)), y: height * (.48 + .32 * Math.sin(time * .13)), r: width * .32, colour: [255, 89, 70] },
        { ...pointer, r: Math.max(100, width * .23), colour: [255, 222, 164] },
      ];
      for (const light of lights) {
        if (light.x < 0) continue;
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.r);
        gradient.addColorStop(0, `rgba(${light.colour.join(",")},.10)`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(light.x - light.r, light.y - light.r, light.r * 2, light.r * 2);
      }
      for (const dot of dots) {
        let strength = 0;
        let colour = lights[0].colour;
        for (const light of lights) {
          const dx = dot.x - light.x, dy = dot.y - light.y;
          if (Math.abs(dx) > light.r || Math.abs(dy) > light.r) continue;
          const value = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / light.r);
          if (value > strength) { strength = value; colour = light.colour; }
        }
        if (strength < .025) continue;
        const alpha = dot.word ? Math.min(1, strength * 2.3) : strength * .72;
        ctx.fillStyle = `rgba(${dot.word ? "255,239,204" : colour.join(",")},${alpha})`;
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.word ? 1.65 : 1.1 + strength * .5, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduced.matches && !disposed) frame = requestAnimationFrame(draw);
    }
    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width); height = Math.round(rect.height);
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr; canvas.height = height * dpr;
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      base.width = mask.width = width; base.height = mask.height = height;
      const dim = base.getContext("2d")!;
      const lettering = mask.getContext("2d", { willReadFrequently: true })!;
      if (words) {
        const font = getComputedStyle(canvas).getPropertyValue("--f-display");
        lettering.font = `700 ${Math.min(width * .15, 108)}px ${font || "sans-serif"}`;
        lettering.textAlign = "center"; lettering.textBaseline = "middle";
        lettering.fillText("karibu", width * .5, height * .44);
        lettering.fillText("tena", width * .5, height * .59);
      }
      const pixels = lettering.getImageData(0, 0, width, height).data;
      dots = [];
      dim.fillStyle = "rgba(255,247,232,.09)";
      for (let y = 7; y < height; y += 7) for (let x = 7; x < width; x += 7) {
        dots.push({ x, y, word: pixels[(y * width + x) * 4 + 3] > 90 });
        dim.beginPath(); dim.arc(x, y, 1, 0, Math.PI * 2); dim.fill();
      }
      cancelAnimationFrame(frame); draw(performance.now());
    }
    function move(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
    }
    function leave() { pointer.x = pointer.y = -1000; }
    function motion() { cancelAnimationFrame(frame); draw(performance.now()); }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas); resize();
    void document.fonts.ready.then(() => { if (!disposed) resize(); });
    canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerleave", leave);
    reduced.addEventListener("change", motion);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerleave", leave);
      reduced.removeEventListener("change", motion);
    };
  }, [words]);
  return <canvas ref={ref} className="signal-light-field" aria-hidden="true" />;
}
