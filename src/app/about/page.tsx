import type { Metadata } from "next";
import Image from "next/image";
import { Crosshair, Star } from "@phosphor-icons/react/ssr";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";

export const metadata: Metadata = {
  title: "About Us — LED Advertising in Eldoret",
  description:
    "Kwetu Connect Advertising connects businesses and communities through high-impact LED billboard advertising in Eldoret and the North Rift region.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <section className="relative py-[calc(7rem+30px)] lg:py-[calc(9rem+30px)] bg-ink text-white overflow-hidden">
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/images/about-hero.webp')" }} />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              About Us
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              Eldoret is growing.
              <br />
              <span className="italic text-brand-500">Visibility</span>
              {" "}is not.
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Eldoret is transforming into a regional economic hub, with rapid
              urban expansion, increasing vehicle and foot traffic, and a
              critical gap in quality digital advertising. Brands are competing,
              but not standing out.{" "}
              <strong className="text-white font-semibold">
                Kwetu Connect exists to change that.
              </strong>
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-20 lg:py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <AnimatedItem delay={1}>
              <div className="mission-vision-card relative rounded-2xl border border-gray-200 bg-white shadow-sm h-full">
                <div className="relative z-[2] p-10 h-full">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-sm font-semibold text-gray-500">
                      Our Mission
                    </span>
                    <div className="rounded-full border border-brand-500/40 p-1.5">
                      <Crosshair size={16} className="text-brand-500" />
                    </div>
                  </div>
                  <p className="text-lg md:text-xl text-gray-700 leading-normal font-display">
                    To connect businesses and communities through bold,
                    high-impact LED advertising in strategic locations across
                    Eldoret and beyond.
                  </p>
                </div>
              </div>
            </AnimatedItem>
            <AnimatedItem delay={2}>
              <div className="mission-vision-card relative rounded-2xl border border-gray-200 bg-white shadow-sm h-full">
                <div className="relative z-[2] p-10 h-full">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-sm font-semibold text-gray-500">
                      Our Vision
                    </span>
                    <div className="rounded-full border border-brand-500/40 p-1.5">
                      <Star size={16} weight="fill" className="text-brand-500" />
                    </div>
                  </div>
                  <p className="text-lg md:text-xl text-gray-700 leading-normal font-display">
                    To become the most trusted outdoor advertising partner in
                    the North Rift region, enabling every brand, local or
                    national, to command attention.
                  </p>
                </div>
              </div>
            </AnimatedItem>
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-ink">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-white">
                Six reasons brands
                <br />
                work with us
              </h2>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-12">
            {[
              {
                num: "01",
                title: "Local Market Expertise",
                body: "We know Eldoret. We know the traffic patterns, the peak hours, and the spots that deliver the most eyes on your brand.",
              },
              {
                num: "02",
                title: "Strategic Premium Locations",
                body: "Our billboard sits at one of Eldoret's busiest corridors, capturing CBD-bound traffic, airport travelers, and Langas residents.",
              },
              {
                num: "03",
                title: "High-Impact LED Technology",
                body: "Bright, dynamic, and impossible to miss. Our LED screen cuts through the noise 24/7, rain or shine.",
              },
              {
                num: "04",
                title: "Affordable & Flexible Bookings",
                body: "From local shops to national brands, you book only the plays your budget allows. No long-term lock-ins required.",
              },
              {
                num: "05",
                title: "Personalized Client Service",
                body: "You're not just a name on a schedule. We work with you to craft messaging that resonates with your audience.",
              },
              {
                num: "06",
                title: "Fast Campaign Turnaround",
                body: "From concept to screen in record time. We streamline the creative process so your brand goes live without delay.",
              },
            ].map((point, i) => (
              <AnimatedItem key={point.title} delay={Math.min(i + 2, 5)}>
                <div className="flex gap-6 border-t border-white/10 pt-8">
                  <span className="text-3xl font-bold text-brand-500 leading-none shrink-0">
                    {point.num}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">
                      {point.title}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {point.body}
                    </p>
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
                Who your
                <br />
                screen reaches
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed mt-4 max-w-xl">
                We target high-value audiences every day, across multiple
                touchpoints and demographics.
              </p>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {[
              { label: "Local Residents", sublabel: "CBD & Estates", image: "/images/about-landing.webp" },
              { label: "Peri-Urban", sublabel: "Outbound County Residents", image: "/images/real-estate.webp" },
              { label: "Transit Traffic", sublabel: "Highway & Commuters", image: "/images/traffic-transit.webp" },
              { label: "Active Farmers", sublabel: "Bread Basket of Kenya", image: "/images/retail.webp" },
              { label: "Airport Travelers", sublabel: "Eldoret Intl. Airport", image: "/images/hero-billboard.webp" },
            ].map((audience, i) => (
              <AnimatedItem
                key={audience.label}
                delay={Math.min(i + 2, 5)}
                className={i === 4 ? "col-span-2 sm:col-span-1" : undefined}
              >
                <div className="relative rounded-2xl overflow-hidden min-h-[180px] sm:min-h-[220px] md:h-80 group">
                  <Image
                    src={audience.image}
                    alt={`${audience.label} — ${audience.sublabel}`}
                    fill
                    sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover md:grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5">
                    <h3 className="text-xs sm:text-sm font-bold text-white mb-0.5 font-display">
                      {audience.label}
                    </h3>
                    <p className="text-[0.6875rem] sm:text-xs text-gray-400 mb-2">
                      {audience.sublabel}
                    </p>
                    <div className="w-6 sm:w-8 h-0.5 bg-brand-500" />
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>
        </div>
      </AnimatedSection>
    </>
  );
}
