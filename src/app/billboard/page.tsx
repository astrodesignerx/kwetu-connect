import Link from "next/link";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import SpotlightHover from "@/components/SpotlightHover";

export default function BillboardPage() {
  return (
    <>
      <section className="relative py-28 lg:py-36 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: "url('/images/billboard-landing.png')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-0">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              Our Billboard
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-3xl font-extrabold leading-tight tracking-[-0.02em] mb-6">
              One screen.<br />
              <span className="italic text-[#EDB347]">Strategically</span> placed.
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              Positioned in the heart of Eldoret&apos;s busiest corridor &mdash;
              capturing traffic inbound to the CBD, outbound to Eldoret
              International Airport, and the Langas residential hub.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-[100px] bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1} animateClass="animate-fade-up-slow">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-2">
              <div className="p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-gray-200">
                <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
                  Live Unit - 01
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-black mb-2">
                  Billboard
                </h2>
                <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-black mb-6">
                  specifications.
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed mb-8 max-w-md">
                  16.1ft&sup2; of full-HD LED canvas, visible from over 200
                  metres. Strategically mounted at 15ft elevation for
                  unobstructed sightlines across multi-lane traffic and
                  pedestrian walkways.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/contact"
                    className="group btn-sweep inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#EDB347] text-black text-sm font-semibold transition-all duration-200 no-underline"
                  >
                    Check Availability
                    <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                  <Link
                    href="/services"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-100 transition-all active:scale-[0.97] no-underline"
                  >
                    See Packages
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-gray-200">
                {[
                  { label: "Format", value: "LED Digital Billboard" },
                  { label: "Dimensions", value: "492cm x 379cm" },
                  { label: "Location", value: "Eldoret Town \u2014 Kisumu Ndogo Road" },
                  { label: "Visibility", value: "Inbound CBD | Outbound Airport | Langas" },
                  { label: "Daily Reach", value: "35,000 \u2013 55,000+ impressions" },
                  { label: "Availability", value: "Slots Available \u2014 Contact Us" },
                ].map((spec) => (
                  <div key={spec.label} className="p-4 sm:p-6 flex flex-col justify-center min-h-[90px] sm:min-h-[120px]">
                    <span className="text-[0.55rem] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      {spec.label}
                    </span>
                    <span className="text-xs sm:text-base font-semibold font-sans text-black leading-snug">
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedItem>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-14">
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-white mb-2">
                See your brand
              </h2>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] italic text-[#EDB347] mb-4">
                on screen.
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
                Real-world examples of how a campaign looks on our display.
              </p>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { image: "/images/daytime-billboard.png", title: "Daytime / inbound CBD" },
              { image: "/images/evening-billboard.png", title: "Evening / outbound airport" },
            ].map((item, i) => (
              <AnimatedItem key={item.title} delay={Math.min(i + 2, 5)}>
                <div className="relative rounded-2xl overflow-hidden min-h-[240px] md:h-80 group">
                  <div className="absolute inset-0 bg-cover bg-top transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: `url('${item.image}')` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="relative h-full flex flex-col justify-between p-6">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-[0.55rem] font-semibold text-[#EDB347] uppercase tracking-wider bg-black/40 backdrop-blur-sm">
                        Live Mockup
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold font-display text-white mb-1">
                        {item.title}
                      </h3>
                    </div>
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-gradient-gold">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-end mb-14">
              <div>
                <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-black mb-2">
                  Billboard
                </h2>
                <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] italic text-[#A97316]">
                  location.
                </h2>
              </div>
              <div className="lg:text-right">
                <p className="text-sm text-gray-600 leading-relaxed">
                  0.4813&deg; N, 35.2649&deg; E &mdash; Kisumu Ndogo Road,
                  Eldoret Town. <span className="text-black font-semibold">Near Langas Junction.</span>
                </p>
              </div>
            </div>
          </AnimatedItem>
          <AnimatedItem delay={2}>
            <div className="relative rounded-2xl overflow-hidden border border-black/10">
              <iframe
                title="Billboard Location Map"
                width="100%"
                height="300"
                className="sm:h-[450px]"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src="https://maps.google.com/maps?q=0.4813143,35.2649463&z=16&output=embed"
                allowFullScreen
              />
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-gray-200 max-w-[220px] shadow-sm">
                <span className="text-[0.55rem] font-semibold text-[#A97316] uppercase tracking-wider block mb-1">
                  Billboard Pin
                </span>
                <span className="text-sm font-bold font-display text-black block mb-0.5">
                  Kisumu Ndogo Road
                </span>
                <span className="text-xs text-gray-500">
                  Near Langas Junction, Eldoret
                </span>
              </div>
            </div>
          </AnimatedItem>
        </div>
      </AnimatedSection>

      <AnimatedSection className="relative py-20 lg:py-24 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-10" style={{ backgroundImage: "url('/images/hero-billboard.jpg')" }} />
        <div className="absolute inset-0 bg-black/80" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <AnimatedItem delay={1}>
            <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-white mb-2">
              Let&apos;s put your brand
            </h2>
            <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] italic text-[#EDB347] mb-12">
              on the map.
            </h2>
          </AnimatedItem>
          <AnimatedItem delay={5}>
            <Link
              href="/contact"
              className="group btn-sweep inline-flex items-center justify-center px-10 py-4 rounded-full bg-[#EDB347] text-black font-bold text-sm tracking-wide transition-all duration-200 no-underline"
            >
              Book a Slot
              <svg className="w-4 h-4 ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </AnimatedItem>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#A97316]/30 to-transparent" />
      </AnimatedSection>
    </>
  );
}
