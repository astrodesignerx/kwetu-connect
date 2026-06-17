"use client";

import { useInView } from "@/hooks/useInView";

export default function StaticVsLed() {
  const { ref, inView } = useInView(0.5);

  return (
    <section id="static-vs-led" className="relative py-24 lg:py-32 bg-white overflow-hidden scroll-mt-[88px]">
      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-[720px] mb-16 lg:mb-20 flex flex-col justify-between min-h-[170px]">
          <div>
            <span
              className={`${
                inView ? "animate-fade-up" : "opacity-0"
              }`}
            />
            <h2
              className={`text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] tracking-[-0.02em] mb-4 ${
                inView ? "animate-fade-up delay-1" : "opacity-0"
              }`}
            >
              <span className="text-black">Static is seen.</span>
              <br />
              <span className="italic text-[#EDB347]">LED is remembered.</span>
            </h2>
          </div>

          <p
            className={`text-sm sm:text-base text-gray-500 leading-relaxed max-w-[600px] ${
              inView ? "animate-fade-up delay-2" : "opacity-0"
            }`}
          >
            Printed billboards fade into the background. An LED screen commands
            attention day and night - with motion, repetition, and real-time
            updates that static can never match.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div
            className={`mission-vision-card static-card-hover relative rounded-[24px] bg-gray-100 border border-gray-200 p-8 sm:p-10 shadow-xl transition-all duration-500 ${
              inView ? "animate-fade-up delay-3" : "opacity-0"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.12em]">
                Static Billboard
              </span>
              <span className="text-[11px] text-gray-400 italic">
                - the old way
              </span>
            </div>

            <h5 className="text-xl font-bold text-gray-400 mb-6 line-through decoration-gray-300">
              Seen once.<br />Easily forgotten.
            </h5>

            <ul className="space-y-3">
              {[
                "Single impression - no repetition",
                "Easily ignored in cluttered environments",
                "No visibility after dark",
                "Static content - no updates",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`mission-vision-card relative rounded-[24px] bg-gradient-to-br from-[#A97316] to-[#EDB347] p-8 sm:p-10 shadow-xl shadow-[#A97316]/15 transition-all duration-500 ${
              inView ? "animate-fade-up delay-4" : "opacity-0"
            }`}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-[0.12em]">
                LED Billboard
              </span>
              <span className="text-[11px] text-white/70 italic">
                - the Kwetu way
              </span>
            </div>

            <h5 className="text-xl font-bold text-white mb-6">
              Dynamic. Bright.<br />
              <span className="italic">Impossible to ignore.</span>
            </h5>

            <ul className="space-y-3">
              {[
                "Motion captures attention instantly",
                "Multiple exposures every hour",
                "Real-time content updates",
                "Visible 24/7 - day and night",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-white/80 font-medium">
                  <svg className="w-4 h-4 text-white/60 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
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
