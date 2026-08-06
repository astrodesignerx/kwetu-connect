"use client";

import { useRef, useEffect } from "react";

export default function SpotlightHover({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay) return;

    const handleMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      container.style.setProperty("--sx", `${e.clientX - rect.left}px`);
      container.style.setProperty("--sy", `${e.clientY - rect.top}px`);
    };
    const handleEnter = () => overlay.classList.add("opacity-100");
    const handleLeave = () => overlay.classList.remove("opacity-100");

    container.addEventListener("mousemove", handleMove);
    container.addEventListener("mouseenter", handleEnter);
    container.addEventListener("mouseleave", handleLeave);
    return () => {
      container.removeEventListener("mousemove", handleMove);
      container.removeEventListener("mouseenter", handleEnter);
      container.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(500px circle at var(--sx, 50%) var(--sy, 50%), rgba(237, 179, 71, 0.15), transparent 50%)",
        }}
      />
      {children}
    </div>
  );
}
