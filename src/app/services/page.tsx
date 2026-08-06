import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Play, Plus, Star } from "@phosphor-icons/react/ssr";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import SpotlightHover from "@/components/SpotlightHover";

export const metadata: Metadata = {
  title: "Services & Packages — LED Billboard Advertising Tiers",
  description:
    "Flexible LED billboard advertising packages in Eldoret: Basic, Standard, Premium, and Platinum tiers, plus custom campaigns and creative design services.",
  alternates: { canonical: "/services" },
};

const tiers = [
  {
    name: "Basic",
    loop: "Every 3 loops",
    appearances: "15",
    bestFor: "Entry-level or local advertisers",
    isFeatured: false,
  },
  {
    name: "Standard",
    loop: "Every 2 loops",
    appearances: "30",
    bestFor: "Consistent, sustained brand awareness",
    isFeatured: false,
  },
  {
    name: "Premium",
    loop: "Every loop",
    appearances: "60",
    bestFor: "High-frequency brand building campaigns",
    isFeatured: false,
  },
  {
    name: "Platinum",
    loop: "Every loop",
    appearances: "60+",
    bestFor: "Dominant brands seeking maximum screen presence",
    isFeatured: true,
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="relative py-[calc(7rem+30px)] lg:py-[calc(9rem+30px)] bg-black text-white overflow-hidden">
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/images/hero-city.webp')" }} />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Services &amp; Packages
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              A single LED screen<br />
              in Eldoret&apos;s busiest corridor
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              We offer flexible advertising packages designed for businesses of
              every size, from local shops making their first impression to
              national brands amplifying their presence in the North Rift.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-20 lg:py-24 bg-white" threshold={0.3}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 max-w-3xl">
            <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-extrabold leading-tight tracking-[-0.02em] text-black">
              Four ways to run your campaign
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mt-4 max-w-xl">
              All tiers include creative review, scheduling, and performance
              reporting. No hidden fees, transparent reporting, and support at
              every step.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier, i) => (
                <AnimatedItem key={tier.name} delay={Math.min(i + 1, 5)} animateClass="animate-fade-up-slow">
                  <div
                    className={`tier-card relative rounded-2xl border p-6 h-full flex flex-col ${
                      tier.isFeatured
                        ? "tier-card-featured bg-brand-500 text-black border-brand-500"
                        : "bg-surface-base text-white border-white/5"
                    }`}
                  >
                    {tier.isFeatured && (
                      <span className="top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 w-fit py-1 px-3 bg-black text-white text-[0.7rem] font-bold uppercase tracking-wider rounded-full flex items-center gap-1 shadow-md z-10" style={{ position: 'absolute' }}>
                        <Star size={12} weight="fill" className="text-brand-500" />
                        Most Popular
                      </span>
                    )}
                    <h3 className={`text-2xl font-bold font-display mb-5 ${tier.isFeatured ? "text-black" : "text-white"}`}>
                      {tier.name}
                    </h3>
                    <div className={`border-t pt-4 pb-3 flex justify-between items-center ${tier.isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.7rem] uppercase tracking-wider font-semibold ${tier.isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Loop frequency
                      </span>
                      <span className={`text-sm font-bold ${tier.isFeatured ? "text-black" : "text-white"}`}>
                        {tier.loop}
                      </span>
                    </div>
                    <hr className={tier.isFeatured ? "border-black/20" : "border-white/10"} />
                    <div className={`pt-3 pb-4 flex justify-between items-center ${tier.isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.7rem] uppercase tracking-wider font-semibold ${tier.isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Appearances / hour
                      </span>
                      <span className={`text-[2rem] font-bold font-display ${tier.isFeatured ? "text-black" : "text-white"}`}>
                        {tier.appearances}
                      </span>
                    </div>
                    <hr className={tier.isFeatured ? "border-black/20" : "border-white/10"} />
                    <div className="mt-4 mb-6 flex-1">
                      <span className={`text-[0.7rem] font-bold uppercase tracking-wider ${tier.isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Best For
                      </span>
                      <p className={`text-sm mt-1 leading-relaxed ${tier.isFeatured ? "text-black/80" : "text-gray-400"}`}>
                        {tier.bestFor}
                      </p>
                    </div>
                    <Link
                      href="/contact"
                       className={`group inline-flex items-center justify-center w-full px-6 py-[11px] rounded-full font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.97] no-underline ${
                        tier.isFeatured
                          ? "btn-sweep bg-black text-white"
                          : "btn-lift bg-white text-black hover:bg-brand-500 hover:text-black"
                      }`}
                    >
                      Book a Slot
                      <ArrowRight size={14} className="ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </Link>
                  </div>
                </AnimatedItem>
            ))}
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mt-8 text-center">
            Restricted industries (Politics, Betting) are on a fixed-rate package. Custom packages are also available; <span className="text-white font-semibold">contact us for details.</span>
          </p>
        </div>
      </AnimatedSection>

      <AnimatedSection className="relative py-24 lg:py-32 bg-black overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/traffic-transit.webp')" }} />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-white max-w-3xl mx-auto leading-snug">
            35,000&ndash;55,000+ impressions a day on one screen, at one junction.
          </p>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-14">
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-extrabold leading-tight tracking-[-0.02em] text-white">
                Design and
                <br />
                build support
              </h2>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <AnimatedItem delay={2}>
                <SpotlightHover>
                <div className="mission-vision-card relative rounded-2xl border border-white/5 bg-surface-base p-8 min-h-[320px] flex flex-col">
                  <div className="relative flex-1 flex flex-col">
                    <Plus size={40} weight="light" className="text-brand-500 mb-5" />
                    <h3 className="text-xl font-bold font-display text-white mb-3">
Custom Packages
                    </h3>
                    <p className="text-base text-gray-400 leading-relaxed mb-6 flex-1">
                      Have a unique campaign requirement? We&apos;ll build a package
                      around your goals, timeline, and budget. Multi-month,
                      geo-targeted bursts, product launches, all welcome.
                    </p>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-brand-500 hover:text-brand-400 transition-colors no-underline mt-auto"
                    >
                      Build a custom package
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
                </SpotlightHover>
            </AnimatedItem>
            <AnimatedItem delay={3}>
                <SpotlightHover>
                <div className="mission-vision-card relative rounded-2xl border border-white/5 bg-surface-base p-8 min-h-[320px] flex flex-col">
                  <div className="relative flex-1 flex flex-col">
                    <Play size={40} weight="fill" className="text-brand-500 mb-5" />
                    <h3 className="text-xl font-bold font-display text-white mb-3">
                      Motion &amp; Still Ad Design Services
                    </h3>
                    <p className="text-base text-gray-400 leading-relaxed mb-6 flex-1">
                      Need your creative done? Our team offers motion and still ad
                      design services to get your campaign live fast: bold,
                      on-screen-ready, optimised for LED.
                    </p>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-brand-500 hover:text-brand-400 transition-colors no-underline mt-auto"
                    >
                      Brief the creative team
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
                </SpotlightHover>
            </AnimatedItem>
          </div>
        </div>
      </AnimatedSection>

    </>
  );
}
