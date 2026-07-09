"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import StaticVsLed from "@/components/StaticVsLed";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import HeroAccessories from "@/components/HeroAccessories";
import SpotlightHover from "@/components/SpotlightHover";
import { getLenis } from "@/components/SmoothScroll";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <AnimatedSection className="relative min-h-[calc(94vh+55px)] flex flex-col bg-black">
        <div
          className={`absolute -top-[88px] left-0 right-0 w-full h-[calc(100%+88px)] overflow-hidden ${mounted ? "opacity-40" : "opacity-0"} transition-opacity duration-1000 ease-linear`}
        >
          <div
            className="ken-burns absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/images/hero-kenburns-day.webp')" }}
          />
          <div
            className="ken-burns night-layer absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/images/hero-kenburns-ii.webp')" }}
          />
          <div
            className="ken-burns crossfade-layer absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/images/hero-kenburns.webp')" }}
          />
        </div>
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
        {/* ── Hero overlay effects ── */}
        <div className="absolute inset-0 scan-lines paused-scan pointer-events-none" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[
            { left: 4, bottom: 6, size: 3, delay: 0.2, dur: 9.0 },
            { left: 11, bottom: 18, size: 2, delay: 3.4, dur: 11.2 },
            { left: 17, bottom: 4, size: 4, delay: 1.1, dur: 10.4 },
            { left: 23, bottom: 22, size: 2, delay: 5.7, dur: 8.6 },
            { left: 29, bottom: 9, size: 5, delay: 2.3, dur: 12.8 },
            { left: 35, bottom: 14, size: 3, delay: 6.9, dur: 9.7 },
            { left: 41, bottom: 3, size: 2, delay: 0.8, dur: 10.1 },
            { left: 47, bottom: 19, size: 4, delay: 4.5, dur: 11.9 },
            { left: 53, bottom: 7, size: 3, delay: 7.6, dur: 8.3 },
            { left: 59, bottom: 24, size: 2, delay: 1.9, dur: 13.1 },
            { left: 65, bottom: 11, size: 5, delay: 3.8, dur: 9.9 },
            { left: 71, bottom: 5, size: 3, delay: 5.2, dur: 10.6 },
            { left: 77, bottom: 16, size: 2, delay: 0.4, dur: 12.2 },
            { left: 83, bottom: 8, size: 4, delay: 6.1, dur: 8.9 },
            { left: 89, bottom: 21, size: 3, delay: 2.7, dur: 11.4 },
            { left: 95, bottom: 13, size: 2, delay: 4.9, dur: 9.3 },
            { left: 8, bottom: 27, size: 3, delay: 7.1, dur: 10.8 },
            { left: 14, bottom: 33, size: 2, delay: 1.5, dur: 12.6 },
            { left: 26, bottom: 30, size: 4, delay: 3.2, dur: 8.7 },
            { left: 38, bottom: 28, size: 3, delay: 5.4, dur: 11.1 },
            { left: 50, bottom: 32, size: 2, delay: 0.9, dur: 9.5 },
            { left: 62, bottom: 29, size: 5, delay: 6.4, dur: 13.4 },
            { left: 74, bottom: 31, size: 3, delay: 2.0, dur: 10.2 },
            { left: 86, bottom: 27, size: 2, delay: 4.1, dur: 8.4 },
            { left: 92, bottom: 34, size: 4, delay: 7.9, dur: 12.0 },
            { left: 20, bottom: 38, size: 3, delay: 3.6, dur: 9.8 },
            { left: 68, bottom: 37, size: 2, delay: 1.3, dur: 11.6 },
          ].map((p, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${p.left}%`,
                bottom: `${p.bottom}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.dur}s`,
              }}
            />
          ))}
        </div>
        <div className="flex-1 flex items-center">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 w-full">
            <div className="max-w-2xl">
            <AnimatedItem delay={1}>
              <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
                LED ADVERTISING
              </span>
            </AnimatedItem>
            <AnimatedItem delay={2}>
              <h1 className="text-[2.2rem] xs:text-[2.8rem] sm:text-[4rem] lg:text-[5rem] font-extrabold leading-[0.9] tracking-[-0.02em] text-white mb-6">
                Connecting<br />
                <span className="italic text-[#EDB347]">Brands</span> to<br />
                <span className="italic text-[#EDB347]">Community.</span>
              </h1>
            </AnimatedItem>
            <AnimatedItem delay={3}>
              <p className="text-sm sm:text-base text-gray-300 leading-relaxed mb-10 max-w-xl">
                Eldoret&apos;s premier LED billboard advertising platform.<br />
                Put your brand where it can&apos;t be ignored.
              </p>
            </AnimatedItem>
            <AnimatedItem delay={4}>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                   className="group btn-sweep inline-flex items-center justify-center px-6 py-3 rounded-full bg-[#EDB347] text-black font-semibold text-sm tracking-wide transition-all duration-200 no-underline"
                >
                  Book a Slot
                  <svg className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  href="/billboard"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-white/30 text-white font-semibold text-sm tracking-wide hover:bg-white/10 active:scale-[0.97] transition-all duration-200 no-underline"
                >
                  View Our Billboard
                </Link>
              </div>
          </AnimatedItem>
        </div>
        </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none animate-fade-in-delayed">
        <button
          type="button"
                    onClick={() => {
            const lenis = getLenis();
            if (lenis) {
              lenis.scrollTo("#static-vs-led", { duration: 1.5 });
            } else {
              document.getElementById("static-vs-led")?.scrollIntoView({ behavior: "smooth" });
            }
          }}
          className="flex flex-col items-center gap-1 pb-8 pointer-events-auto animate-float cursor-pointer bg-transparent border-none"
        >
          <span className="text-xs uppercase tracking-[0.3em] text-[#8A8A8A]">
            SCROLL
          </span>
          <svg className="w-4 h-4 text-[#2A2A2A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 9l7 7 7-7" />
          </svg>
        </button>
        </div>
      </AnimatedSection>

      <HeroAccessories />

      <StaticVsLed />

      <AnimatedSection className="relative py-20 lg:py-24 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm" style={{ backgroundImage: "url('/images/stats-traffic.jpg')" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/95 to-black" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-14">
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-white">
                  Numbers that{" "}
                  <span className="italic text-[#EDB347]">deliver</span> results.
                </h2>
              </div>
              <div className="mt-4 lg:mt-0 lg:text-right">
              </div>
            </div>
          </AnimatedItem>
          <SpotlightHover>
          <AnimatedItem delay={2}>
            <div className="rounded-2xl border border-white/5 bg-[#111111] overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
                {[
                  { highlight: "35K\u201350K+", title: "Daily Traffic Reached", desc: "Vehicles and pedestrians passing our Eldoret screen every day." },
                  { highlight: "HIGH", title: "Brand Recall Through Repetition", desc: "Multiple exposures per visit drive recognition that static can\u2019t match." },
                  { highlight: "PRIME", title: "Commuter & Foot Traffic Exposure", desc: "Capturing CBD-bound, airport-bound, and Langas corridor traffic." },
                ].map((col, i) => (
                  <div key={col.title} className="p-8 lg:p-10 flex flex-col">
                    <span className="text-3xl sm:text-4xl font-extrabold font-sans text-white mb-2">{col.highlight}</span>
                    <span className="text-base font-bold font-sans text-white mb-3">{col.title}</span>
                    <p className="text-sm text-gray-400 leading-relaxed mt-auto">{col.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedItem>
          </SpotlightHover>
          <AnimatedItem delay={4}>
            <p className="text-center mt-10 text-base">
              <span className="text-gray-400 font-medium">Visibility today.</span>{" "}
              <span className="text-[#EDB347] italic font-semibold">Sales tomorrow.</span>
            </p>
          </AnimatedItem>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14">
            <AnimatedItem delay={1}>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-black">
                Who we{" "}
                <span className="italic text-[#EDB347]">work</span> with.
              </h2>
            </AnimatedItem>
            <AnimatedItem delay={1}>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xl mt-4">
                We partner with businesses and organisations that want to be seen
                and remembered.
              </p>
            </AnimatedItem>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { image: "/images/retail.jpg", label: "Retail & Supermarkets", svg: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" },
              { image: "/images/real-estate.jpg", label: "Real Estate Developers", svg: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
              { image: "/images/schools.jpg", label: "Schools & Colleges", svg: "M12 14l9-5-9-5-9 5 9 5zm0 7l-9-5 9-5 9 5-9 5z" },
              { image: "/images/events.jpg", label: "Events & Promotions", svg: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
            ].map((category, i) => (
              <AnimatedItem key={category.label} delay={Math.min(i + 2, 5)}>
                <div className="relative rounded-2xl overflow-hidden min-h-[240px] md:h-96 group transition-all duration-200">
                  <div className="absolute inset-0 bg-cover bg-center md:grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110" style={{ backgroundImage: `url('${category.image}')` }} />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 to-transparent" />
                  <div className="relative h-full flex flex-col items-center justify-end p-6 text-center">
                    <svg className="w-10 h-10 text-[#EDB347] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={category.svg} />
                    </svg>
                    <h3 className="text-base font-bold font-sans text-white group-hover:text-[#EDB347] transition-colors">
                      {category.label}
                    </h3>
                    <div className="w-8 h-0.5 bg-[#EDB347] mt-3"></div>
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>
          <AnimatedItem delay={5}>
            <p className="text-center mt-14 text-base">
              <span className="text-gray-500 font-medium">Your Industry. </span>
              <span className="text-[#EDB347] italic font-semibold">Your Message.</span>{' '}
              <span className="text-gray-500 font-medium">Our Screen.</span>
            </p>
          </AnimatedItem>
        </div>
      </AnimatedSection>
    </>
  );
}
