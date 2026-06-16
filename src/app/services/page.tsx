import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import SpotlightHover from "@/components/SpotlightHover";

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
      <section className="relative py-28 lg:py-36 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/images/hero-city.jpg')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              Services &amp; Packages
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-3xl font-extrabold leading-tight tracking-[-0.02em] mb-6">
              High-impact LED<br />
              in a{" "}
              <span className="italic text-[#EDB347]">strategic</span>
              {" "}location.
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              We offer flexible advertising packages designed for businesses of
              every size - from local shops making their first impression to
              national brands amplifying their presence in the North Rift.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-20 lg:py-24 bg-white" threshold={0.3}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-end mb-16">
            <div>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-extrabold leading-tight tracking-[-0.02em] text-black">
                Four ways to be
              </h2>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-extrabold leading-tight tracking-[-0.02em] italic text-[#EDB347]">
                on screen.
              </h2>
            </div>
            <div className="lg:text-right">
              <p className="text-sm text-gray-500 leading-relaxed max-w-md lg:ml-auto">
                All tiers include creative review, scheduling, and
                performance reporting. No hidden fees - just clear,
                transparent advertising that delivers.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.map((tier, i) => (
                <AnimatedItem key={tier.name} delay={Math.min(i + 1, 5)} animateClass="animate-fade-up-slow">
                  <div
                    className={`tier-card relative rounded-2xl border p-6 h-full flex flex-col ${
                      tier.isFeatured
                        ? "tier-card-featured bg-[#EDB347] text-black border-[#EDB347]"
                        : "bg-[#111111] text-white border-white/5"
                    }`}
                  >
                    {tier.isFeatured && (
                      <span className="top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 w-fit py-1 px-3 bg-black text-white text-[0.6rem] font-bold uppercase tracking-wider rounded-full flex items-center gap-1 shadow-md z-10" style={{ position: 'absolute' }}>
                        <svg className="w-3 h-3 text-[#EDB347]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Most Popular
                      </span>
                    )}
                    <h5 className={`text-xl sm:text-2xl font-bold font-display mb-5 ${tier.isFeatured ? "text-black" : "text-white"}`}>
                      {tier.name}
                    </h5>
                    <div className={`border-t pt-4 pb-3 flex justify-between items-center ${tier.isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.6rem] uppercase tracking-wider font-semibold ${tier.isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Loop frequency
                      </span>
                      <span className={`text-sm font-bold ${tier.isFeatured ? "text-black" : "text-white"}`}>
                        {tier.loop}
                      </span>
                    </div>
                    <hr className={tier.isFeatured ? "border-black/20" : "border-white/10"} />
                    <div className={`pt-3 pb-4 flex justify-between items-center ${tier.isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.6rem] uppercase tracking-wider font-semibold ${tier.isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Appearances / hour
                      </span>
                      <span className={`text-2xl font-bold font-display ${tier.isFeatured ? "text-black" : "text-white"}`}>
                        {tier.appearances}
                      </span>
                    </div>
                    <hr className={tier.isFeatured ? "border-black/20" : "border-white/10"} />
                    <div className="mt-4 mb-6 flex-1">
                      <span className={`text-[0.6rem] font-bold uppercase tracking-wider ${tier.isFeatured ? "text-black/70" : "text-gray-400"}`}>
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
                          ? "btn-sweep bg-black text-white hover:text-black"
                          : "bg-white text-black hover:bg-[#EDB347] hover:text-black"
                      }`}
                    >
                      Request a Quote
                      <svg className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </div>
                </AnimatedItem>
            ))}
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mt-8 text-center">
            Restricted industries (Politics, Betting) are on a fixed-rate package. Custom packages are also available <span className="text-white font-semibold">contact us for details.</span>
          </p>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-14">
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-extrabold leading-tight tracking-[-0.02em] text-white">
                Custom builds &amp;
              </h2>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-extrabold leading-tight tracking-[-0.02em] text-white">
                <span className="italic text-[#EDB347]">creative</span> support.
              </h2>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <AnimatedItem delay={2}>
                <SpotlightHover>
                <div className="mission-vision-card relative rounded-2xl border border-white/5 bg-[#111111] p-8 min-h-[320px] flex flex-col">
                  <div className="relative flex-1 flex flex-col">
                    <svg className="w-10 h-10 text-[#EDB347] mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <h3 className="text-xl font-bold font-display text-white mb-3">
Custom Packages
                    </h3>
                    <p className="text-base text-gray-400 leading-relaxed mb-6 flex-1">
                      Have a unique campaign requirement? We&apos;ll build a package
                      around your goals, timeline, and budget. Multi-month,
                      geo-targeted bursts, product launches - all welcome.
                    </p>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#EDB347] hover:text-[#d4a030] transition-colors no-underline mt-auto"
                    >
                      Discuss your campaign &rarr;
                    </Link>
                  </div>
                </div>
                </SpotlightHover>
            </AnimatedItem>
            <AnimatedItem delay={3}>
                <SpotlightHover>
                <div className="mission-vision-card relative rounded-2xl border border-white/5 bg-[#111111] p-8 min-h-[320px] flex flex-col">
                  <div className="relative flex-1 flex flex-col">
                    <svg className="w-10 h-10 text-[#EDB347] mb-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <h3 className="text-xl font-bold font-display text-white mb-3">
                      Motion &amp; Still Ad Design Services
                    </h3>
                    <p className="text-base text-gray-400 leading-relaxed mb-6 flex-1">
                      Need your creative done? Our team offers motion and still ad
                      design services to get your campaign live fast - bold,
                      on-screen-ready, optimised for LED.
                    </p>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[#EDB347] hover:text-[#d4a030] transition-colors no-underline mt-auto"
                    >
                      Brief our creative team &rarr;
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
