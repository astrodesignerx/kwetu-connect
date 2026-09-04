"use client";

import { useInView } from "@/hooks/useInView";
import { Check, X } from "@phosphor-icons/react";

export default function StaticVsLed() {
  const { ref, inView } = useInView(0.5);

  return (
    <section id="static-vs-led" className="relative py-20 lg:py-24 bg-white overflow-hidden scroll-mt-[88px]">
      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-[720px] mb-12 flex flex-col justify-between min-h-[170px]">
          <div>
            <h2
              className={`text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] mb-4 ${
                inView ? "animate-fade-up delay-1" : "anim-pending"
              }`}
            >
              <span className="text-black">LED beats static,</span>
              <br />
              <span className="text-black">on every measure.</span>
            </h2>
          </div>

          <p
            className={`text-sm sm:text-base text-gray-500 leading-relaxed max-w-[600px] ${
              inView ? "animate-fade-up delay-2" : "anim-pending"
            }`}
          >
            Printed billboards fade into the background. An LED screen commands
            attention day and night, with motion, repetition, and real-time
            updates static can never match.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div
            className={`mission-vision-card static-card-hover relative rounded-2xl bg-gray-100 border border-gray-200 p-8 sm:p-10 shadow-xl transition-all duration-500 ${
              inView ? "animate-fade-up delay-3" : "anim-pending"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider">
                Static Billboard
              </span>
              <span className="text-[0.6875rem] text-gray-400 italic">
                - the old way
              </span>
            </div>

            <h3 className="text-xl font-bold text-gray-400 mb-6 line-through decoration-gray-300">
              Seen once.<br />Easily forgotten.
            </h3>

            <ul className="space-y-3">
              {[
                "Single impression - no repetition",
                "Easily ignored in cluttered environments",
                "No visibility after dark",
                "Static content - no updates",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-600">
                  <X size={16} weight="bold" className="text-gray-400 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`mission-vision-card relative rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-8 sm:p-10 shadow-xl shadow-brand-600/15 transition-all duration-500 ${
              inView ? "animate-fade-up delay-4" : "anim-pending"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-[0.6875rem] font-semibold text-white/80 uppercase tracking-wider">
                LED Billboard
              </span>
              <span className="text-[0.6875rem] text-white/70 italic">
                - the Kwetu way
              </span>
            </div>

            <h3 className="text-xl font-bold text-white mb-6">
              Dynamic. Bright.<br />
              <span className="italic">Impossible to ignore.</span>
            </h3>

            <ul className="space-y-3">
              {[
                "Motion captures attention instantly",
                "Multiple exposures every hour",
                "Real-time content updates",
                "Visible 24/7 - day and night",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-white/80 font-medium">
                  <Check size={16} weight="bold" className="text-white/60 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
