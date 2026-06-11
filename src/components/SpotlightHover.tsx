"use client";

import { useRef, useEffect, useState } from "react";

export default function SpotlightHover({ children }: { children: React.ReactNode }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, opacity: 0 });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      setPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        opacity: 1,
      });
    };

    const handleMouseLeave = () => {
      setPosition((prev) => ({ ...prev, opacity: 0 }));
    };

    section.addEventListener("mousemove", handleMouseMove);
    section.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      section.removeEventListener("mousemove", handleMouseMove);
      section.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative">
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-500"
        style={{
          opacity: position.opacity,
          background: `radial-gradient(500px circle at ${position.x}px ${position.y}px, rgba(237, 179, 71, 0.15), transparent 50%)`,
        }}
      />
      {children}
    </div>
  );
}
