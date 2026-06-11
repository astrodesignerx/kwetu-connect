"use client";

import { useInViewSection } from "./AnimatedSection";

export default function AnimatedItem({
  children,
  delay = 0,
  className = "",
  animateClass = "animate-fade-up",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  animateClass?: string;
}) {
  const inView = useInViewSection();

  const delayClass = delay > 0 ? `delay-${Math.min(delay, 5)}` : "";

  return (
    <div
      className={`${inView ? `${animateClass} ${delayClass}` : "opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}
