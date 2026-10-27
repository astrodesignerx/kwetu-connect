import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";

export const metadata: Metadata = {
  title: "Our Billboard — Kisumu Ndogo Road, Eldoret",
  description:
    "Full-HD LED billboard on Kisumu Ndogo Road near Langas Junction, Eldoret — 35,000–55,000+ daily impressions across CBD, airport, and Langas traffic.",
  alternates: { canonical: "/billboard" },
};

export default function BillboardPage() {
  return (
    <>
      <section className="relative py-[calc(7rem+30px)] lg:py-[calc(9rem+30px)] bg-ink text-white overflow-hidden">
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/images/billboard-landing.webp')" }} />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-0">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Our Billboard
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              One screen.<br />
              <span className="italic text-brand-500">Strategically</span> placed.
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              Positioned in the heart of Eldoret&apos;s busiest corridor,
              capturing traffic inbound to the CBD, outbound to Eldoret
              International Airport, and the Langas residential hub.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-20 lg:py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1} animateClass="animate-fade-up-slow">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-2">
              <div className="p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-gray-200">
                <span className="section-label inline-block text-xs font-semibold text-brand-700 uppercase tracking-[0.15em] mb-5">
                  Live Unit - 01
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black mb-6">
                  Billboard
                  <br />
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
                    className="group btn-sweep inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-500 text-black text-sm font-semibold transition-all duration-200 no-underline"
                  >
                    Check Availability
                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
                  </Link>
                  <Link
                    href="/services"
                    className="btn-outline inline-flex items-center gap-2 px-6 py-3 rounded-full border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-100 no-underline"
                  >
                    See Packages
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-gray-200">
                {[
                  { label: "Format", value: "LED Digital Billboard" },
                  { label: "Dimensions", value: "492cm x 379cm" },
                  { label: "Location", value: "Eldoret Town - Kisumu Ndogo Road" },
                  { label: "Visibility", value: "Inbound CBD | Outbound Airport | Langas" },
                  { label: "Daily Reach", value: "35,000 \u2013 55,000+ impressions" },
                  { label: "Availability", value: "Slots Available - Contact Us" },
                ].map((spec) => (
                  <div key={spec.label} className="mission-vision-card relative p-5 sm:p-6 flex flex-col justify-center min-h-[90px] sm:min-h-[120px]">
                    <div className="relative z-10">
                      <span className="block text-xs sm:text-sm font-bold text-brand-700 uppercase tracking-wider mb-1.5">
                        {spec.label}
                      </span>
                      <span className="block text-xs sm:text-base font-semibold font-sans text-black leading-snug">
                        {spec.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedItem>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-gradient-gold">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12 max-w-3xl">
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
                Where the screen is
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed mt-4">
                0.4813&deg; N, 35.2649&deg; E, Kisumu Ndogo Road, Eldoret Town.{" "}
                <span className="text-black font-semibold">Near Langas Junction.</span>
              </p>
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

      <AnimatedSection className="relative py-20 lg:py-24 bg-ink text-white overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-white mb-4">
                Your campaign,
                <br />
                live on screen
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
                Real-world examples of how a campaign looks on our display.
              </p>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { image: "/images/daytime-billboard.webp", title: "Daytime / inbound CBD" },
              { image: "/images/evening-billboard.webp", title: "Evening / outbound airport" },
            ].map((item, i) => (
              <AnimatedItem key={item.title} delay={Math.min(i + 2, 5)}>
                <div className="relative rounded-2xl overflow-hidden min-h-[240px] md:h-80 group">
                  <Image
                    src={item.image}
                    alt={`Billboard campaign mockup — ${item.title}`}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover object-top transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-between p-6">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider bg-ink/40 backdrop-blur-sm">
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
          <div className="mt-20 lg:mt-24 text-center">
            <AnimatedItem delay={1}>
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-white mb-12">
                Put your brand here
              </h2>
            </AnimatedItem>
            <AnimatedItem delay={2}>
              <Link
                href="/book"
                className="group btn-sweep inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-500 text-black font-semibold text-sm tracking-wide transition-all duration-200 no-underline"
              >
                Book plays
                <ArrowRight size={16} className="ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" />
              </Link>
            </AnimatedItem>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-600/30 to-transparent" />
      </AnimatedSection>
    </>
  );
}
