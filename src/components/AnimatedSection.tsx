"use client";

import { createContext, useContext } from "react";
import { useInView } from "@/hooks/useInView";

const InViewContext = createContext(false);

export function useInViewSection() {
  return useContext(InViewContext);
}

export default function AnimatedSection({
  children,
  className = "",
  threshold = 0.1,
}: {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}) {
  const { ref, inView } = useInView(threshold);

  return (
    <div ref={ref} className={className}>
      <InViewContext.Provider value={inView}>
        {children}
      </InViewContext.Provider>
    </div>
  );
}
