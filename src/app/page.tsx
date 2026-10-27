"use client";

import { preload } from "react-dom";
import Link from "next/link";
import { ArrowRight, CaretDown } from "@phosphor-icons/react";
import StaticVsLed from "@/components/StaticVsLed";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import HeroAccessories from "@/components/HeroAccessories";
import HowItWorks from "@/components/HowItWorks";
import RecentCampaigns from "@/components/RecentCampaigns";
import WhoWeWorkWith from "@/components/WhoWeWorkWith";
import { getLenis } from "@/components/SmoothScroll";

export default function HomePage() {
  // The Ken Burns layers are CSS backgrounds (the glitch pseudo-elements
  // inherit background-image), so hint the browser to fetch them early.
  preload("/images/hero-kenburns-day.webp", { as: "image" });
  preload("/images/hero-kenburns-ii.webp", { as: "image" });
  preload("/images/hero-kenburns.webp", { as: "image" });

  return (
    <>
      <AnimatedSection className="relative min-h-svh flex flex-col bg-ink">
        <div
          className="hero-kenburns-enter absolute -top-[88px] left-0 right-0 w-full h-[calc(100%+88px)] overflow-hidden"
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
        {/* Mobile text runs full-width, so a vertical scrim keeps it legible over
            the photo; desktop text sits on the left, so it fades horizontally. */}
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 sm:bg-gradient-to-r sm:from-black/80 sm:via-black/60 sm:to-transparent" />
        {/* ── Hero overlay effects ── */}
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 scan-lines paused-scan pointer-events-none" />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 overflow-hidden pointer-events-none">
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
              className={`particle ${i % 2 ? "max-sm:hidden" : ""}`}
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
        <div className="flex-1 flex flex-col justify-center">
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pb-28 w-full">
            <div className="max-w-2xl">
            <AnimatedItem delay={1}>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                </span>
                <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em]">
                  LED ADVERTISING
                </span>
              </div>
            </AnimatedItem>
            <AnimatedItem delay={2}>
              <h1 className="text-[2.2rem] xs:text-[2.8rem] sm:text-[4rem] lg:text-[4.5rem] font-extrabold leading-[1.02] sm:leading-[0.9] tracking-[-0.02em] text-white mb-6">
                Connecting<br />
                <span className="italic text-brand-500">Brands</span> to<br />
                <span className="italic text-brand-500">Community</span>
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
                  href="/book"
                   className="group btn-sweep inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-500 text-black font-semibold text-sm tracking-wide transition-all duration-200 no-underline"
                >
                  Book plays
                  <ArrowRight size={14} className="ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                </Link>
                <Link
                  href="/billboard"
                  className="btn-outline inline-flex items-center justify-center px-6 py-3 rounded-full border border-white/25 text-gray-200 font-semibold text-sm tracking-wide hover:bg-white/10 hover:text-brand-500 hover:border-white/40 no-underline"
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
          <span className="text-xs uppercase tracking-[0.3em] text-gray-500">
            SCROLL
          </span>
          <CaretDown size={16} weight="bold" className="text-gray-500" />
        </button>
        </div>
      </AnimatedSection>

      <HeroAccessories />

      <StaticVsLed />

      <HowItWorks />

      <AnimatedSection className="py-20 lg:py-24 bg-white text-black overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <AnimatedItem delay={1}>
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
                Who we work with
              </h2>
            </AnimatedItem>
            <AnimatedItem delay={1}>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xl mt-4">
                We partner with businesses and organisations that want to be seen
                and remembered.
              </p>
            </AnimatedItem>
          </div>
          <AnimatedItem delay={2}>
            <WhoWeWorkWith />
          </AnimatedItem>
        </div>
      </AnimatedSection>

      <AnimatedSection className="relative py-20 lg:py-24 bg-gradient-gold text-black overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-12">
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
                  Numbers that{" "}
                  <span className="italic text-brand-900">deliver</span> results.
                </h2>
              </div>
            </div>
          </AnimatedItem>
          <AnimatedItem delay={2}>
            <div className="rounded-2xl border border-black/10 bg-white/20 backdrop-blur-sm overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black/10">
                {[
                  { highlight: "35,000\u201355,000+", title: "Daily Impressions", desc: "Vehicles and pedestrians passing our Eldoret screen every day." },
                  { highlight: "60 /hr", title: "Exposures per Hour", desc: "Multiple exposures per visit drive recognition that static can\u2019t match." },
                  { highlight: "200 m", title: "Viewing Distance", desc: "Visible well before the junction, day and night, from multi-lane traffic." },
                ].map((col) => (
                  <div key={col.title} className="p-8 lg:p-10 flex flex-col">
                    <span className="text-3xl sm:text-4xl font-extrabold font-sans text-black mb-2">{col.highlight}</span>
                    <span className="text-base font-bold font-sans text-black mb-3">{col.title}</span>
                    <p className="text-sm text-black/70 leading-relaxed mt-auto">{col.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedItem>
        </div>
      </AnimatedSection>

      <RecentCampaigns />
    </>
  );
}
