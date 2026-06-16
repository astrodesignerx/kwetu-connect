import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import SpotlightHover from "@/components/SpotlightHover";

export default function AboutPage() {
  return (
    <>
      <section className="relative py-28 lg:py-36 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/landing-page.png')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              About Us
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-3xl font-extrabold leading-tight tracking-[-0.02em] mb-6">
              Eldoret is growing.
              <br />
              <span className="italic text-[#EDB347]">Visibility</span>
              {" "}is not.
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Eldoret is transforming into a regional economic hub - with rapid
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
                    <span className="text-xs font-semibold text-[#A97316] uppercase tracking-wider">
                      Our Mission
                    </span>
                    <div className="rounded-full border border-[#EDB347]/40 p-1.5">
                      <svg className="w-4 h-4 text-[#EDB347]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-lg md:text-xl text-gray-700 leading-normal font-serif">
                    To <span className="italic text-[#EDB347]">connect</span> businesses
                    and communities through bold, high-impact LED advertising in
                    strategic locations across Eldoret and beyond.
                  </p>
                </div>
              </div>
            </AnimatedItem>
            <AnimatedItem delay={2}>
              <div className="mission-vision-card relative rounded-2xl border border-gray-200 bg-white shadow-sm h-full">
                <div className="relative z-[2] p-10 h-full">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-xs font-semibold text-[#A97316] uppercase tracking-wider">
                      Our Vision
                    </span>
                    <div className="rounded-full border border-[#EDB347]/40 p-1.5">
                      <svg className="w-4 h-4 text-[#EDB347]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-lg md:text-xl text-gray-700 leading-normal font-serif">
                    To become the most{" "}
                    <span className="italic text-[#EDB347]">trusted</span> outdoor
                    advertising partner in the North Rift region, enabling every
                    brand - local or national - to command attention.
                  </p>
                </div>
              </div>
            </AnimatedItem>
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-white">
                Five reasons brands
              </h2>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] italic text-[#EDB347]">
                choose us.
              </h2>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                num: "01",
                title: "Local Market Expertise",
                body: "We know Eldoret. We know the traffic patterns, the peak hours, and the spots that deliver the most eyes on your brand.",
              },
              {
                num: "02",
                title: "Strategic Premium Locations",
                body: "Our billboard sits at one of Eldoret's busiest corridors - capturing CBD-bound traffic, airport travelers, and Langas residents.",
              },
              {
                num: "03",
                title: "High-Impact LED Technology",
                body: "Bright, dynamic, and impossible to miss. Our LED screen cuts through the noise 24/7, rain or shine.",
              },
              {
                num: "04",
                title: "Affordable & Flexible Packages",
                body: "From local shops to national brands - we have a package that fits your budget. No long-term lock-ins required.",
              },
              {
                num: "05",
                title: "Personalized Client Service",
                body: "You're not just a slot number. We work with you to craft messaging that resonates with your audience.",
              },
              {
                num: "06",
                title: "Fast Campaign Turnaround",
                body: "From concept to screen in record time. We streamline the creative process so your brand goes live without delay.",
              },
            ].map((point, i) => (
              <AnimatedItem key={point.title} delay={Math.min(i + 2, 5)}>
                <SpotlightHover>
                <div className="relative group rounded-2xl border border-white/5 p-7 bg-[#111111] min-h-[260px] h-full transition-all duration-200 hover:border-[#EDB347]/50 hover:shadow-[0_0_30px_-4px_rgba(237,179,71,0.25)]">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl font-bold text-[#EDB347] font-serif">
                      {point.num}
                    </span>
                    <svg className="w-5 h-5 text-white/40 mt-1 transition-colors duration-300 group-hover:text-[#EDB347] group-hover:drop-shadow-[0_0_6px_rgba(237,179,71,0.6)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 font-serif">
                    {point.title}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {point.body}
                  </p>
                </div>
                </SpotlightHover>
              </AnimatedItem>
            ))}
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] text-black">
                Who sees
              </h2>
              <h2 className="text-3xl sm:text-4xl lg:text-2xl font-bold leading-tight tracking-[-0.02em] italic text-[#EDB347]">
                your brand?
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed mt-4 max-w-xl">
                We target high-value audiences every day - across multiple
                touchpoints and demographics.
              </p>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {[
              { label: "Local Residents", sublabel: "CBD & Estates", image: "/images/about-landing.png" },
              { label: "Peri-Urban", sublabel: "Outbound County Residents", image: "/images/real-estate.jpg" },
              { label: "Transit Traffic", sublabel: "Highway & Commuters", image: "/images/traffic-transit.jpg" },
              { label: "Active Farmers", sublabel: "Bread Basket of Kenya", image: "/images/retail.jpg" },
              { label: "Airport Travelers", sublabel: "Eldoret Intl. Airport", image: "/images/hero-billboard.jpg" },
            ].map((audience, i) => (
              <AnimatedItem key={audience.label} delay={Math.min(i + 2, 5)}>
                <div className="relative rounded-2xl overflow-hidden min-h-[180px] sm:min-h-[220px] md:h-80 group">
                  <div className="absolute inset-0 bg-cover bg-center md:grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110" style={{ backgroundImage: `url('${audience.image}')` }} />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5">
                    <h3 className="text-xs sm:text-sm font-bold text-white mb-0.5 font-serif">
                      {audience.label}
                    </h3>
                    <p className="text-[0.6rem] sm:text-xs text-gray-400 mb-2">
                      {audience.sublabel}
                    </p>
                    <div className="w-6 sm:w-8 h-0.5 bg-[#EDB347]" />
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>
          <AnimatedItem delay={5}>
            <p className="text-center text-base mt-12">
              <span className="text-gray-500 font-medium">One screen. </span>
              <span className="text-[#EDB347] italic font-semibold">Diverse</span>
              <span className="text-gray-500 font-medium"> reach. Maximum impact.</span>
            </p>
          </AnimatedItem>
        </div>
      </AnimatedSection>
    </>
  );
}
