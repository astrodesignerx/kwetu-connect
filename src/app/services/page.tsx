import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Play, Plus, Star } from "@phosphor-icons/react/ssr";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import SpotlightHover from "@/components/SpotlightHover";
import { DEFAULT_SETTINGS, quote } from "@/lib/booking";
import type { BookingRequest } from "@/lib/booking";

export const metadata: Metadata = {
  title: "Prices and Services | LED Billboard Advertising in Eldoret",
  description:
    "We sell plays at KES 1 a second on our LED billboard in Eldoret, with discounts for bigger bookings and design help if you need it.",
  alternates: { canonical: "/services" },
};

const formatNumber = (value: number) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const formatKes = (value: number) => `KES ${formatNumber(value)}`;

const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const weekdayScreen = DEFAULT_SETTINGS.screenHours[1];
const weekendScreen = DEFAULT_SETTINGS.screenHours[5];

const discountSteps = [...DEFAULT_SETTINGS.discountSteps].sort(
  (a, b) => a.minPlays - b.minPlays
);

type Example = {
  name: string;
  detail: string;
  weeks: number;
  // Fixed reference dates only price the example: whole weeks cost the same whatever the start.
  request: BookingRequest;
};

const examples: Example[] = [
  {
    name: "Small shop",
    detail: "10 s play, every 6 minutes, Saturdays, Morning and Midday, 4 weeks",
    weeks: 4,
    request: {
      lengthSeconds: 10,
      howOften: 10,
      days: [6],
      blocks: ["morning", "midday"],
      startDate: "2026-11-02",
      endDate: "2026-11-29",
    },
  },
  {
    name: "Growing business",
    detail: "15 s play, every 6 minutes, Friday to Sunday, every block, 2 weeks",
    weeks: 2,
    request: {
      lengthSeconds: 15,
      howOften: 10,
      days: [5, 6, 0],
      blocks: ["morning", "midday", "afternoon", "evening", "late"],
      startDate: "2026-11-02",
      endDate: "2026-11-15",
    },
  },
  {
    name: "Large organisation",
    detail: "15 s play, every 6 minutes, every day, every block, 12 weeks",
    weeks: 12,
    request: {
      lengthSeconds: 15,
      howOften: 10,
      days: [0, 1, 2, 3, 4, 5, 6],
      blocks: ["morning", "midday", "afternoon", "evening", "late"],
      startDate: "2026-11-02",
      endDate: "2027-01-24",
    },
  },
];

function exampleQuote(request: BookingRequest) {
  const result = quote(request);
  if (!result.ok) {
    throw new Error(`Example booking is invalid: ${result.errors.join(" ")}`);
  }
  return result;
}

function bookingHref({ request, weeks }: Example) {
  return `/book?len=${request.lengthSeconds}&often=${request.howOften}&days=${request.days.join(",")}&blocks=${request.blocks.join(",")}&weeks=${weeks}`;
}

export default function ServicesPage() {
  return (
    <>
      <section className="relative py-[calc(7rem+30px)] lg:py-[calc(9rem+30px)] bg-ink text-white overflow-hidden">
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/images/hero-city.webp')" }} />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Plays &amp; Prices
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              A single LED screen<br />
              in Eldoret&apos;s busiest corridor
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              We sell plays on one screen, for businesses of every size, from
              local shops making their first impression to national brands
              amplifying their presence in the North Rift.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-20 lg:py-24 bg-white" threshold={0.3}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-3xl">
            <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
              We sell plays
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mt-4 max-w-xl">
              A play is your advert, shown once. Plays cost KES 1 a second, so
              a 10 s play costs KES 10. Pick a length, then choose how often it
              plays, the days and the time blocks. The booking page works out
              the plays and the price as you go.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {DEFAULT_SETTINGS.lengths.map((length, i) => (
              <AnimatedItem key={length} delay={Math.min(i + 1, 5)} animateClass="animate-fade-up-slow">
                <div className="tier-card relative rounded-2xl border p-6 h-full flex flex-col bg-surface-raised text-white border-white/5">
                  <span className="text-[0.6875rem] uppercase tracking-wider font-semibold text-gray-400">
                    Length
                  </span>
                  <h3 className="text-2xl font-bold font-display mb-5 text-white">
                    {length} s
                  </h3>
                  <div className="border-t border-white/10 pt-4 flex justify-between items-baseline gap-2 mt-auto">
                    <span className="text-[0.6875rem] uppercase tracking-wider font-semibold text-gray-400">
                      One play
                    </span>
                    <span className="text-[2rem] font-bold font-display text-white">
                      {formatKes(length * DEFAULT_SETTINGS.kesPerSecond)}
                    </span>
                  </div>
                </div>
              </AnimatedItem>
            ))}
          </div>

          <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
              <h3 className="text-xl font-bold font-display text-black mb-4">
                Book more, pay less
              </h3>
              <ul className="divide-y divide-gray-200">
                <li className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-gray-600">
                    {`Up to ${formatNumber(discountSteps[0].minPlays - 1)} plays`}
                  </span>
                  <span className="text-sm font-bold text-black">No discount</span>
                </li>
                {discountSteps.map((step) => (
                  <li key={step.minPlays} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm text-gray-600">
                      {`${formatNumber(step.minPlays)} plays or more`}
                    </span>
                    <span className="text-sm font-bold text-black">{`${step.percent}% off`}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-4 text-sm text-gray-600 leading-relaxed">
              <p className="font-bold text-black">
                The smallest order is {formatKes(DEFAULT_SETTINGS.minOrderKes)}.
              </p>
              <p>
                <span className="font-bold text-black">Every hour costs the same.</span>{" "}
                You pay for the length of the play, not the time of day.
              </p>
              <p className="font-bold text-black">Prices include VAT.</p>
              <p>
                Screen hours run {formatHour(weekdayScreen.open)} to{" "}
                {formatHour(weekdayScreen.close)} Monday to Thursday, and{" "}
                {formatHour(weekendScreen.open)} to {formatHour(weekendScreen.close)}{" "}
                Friday to Sunday. KCA confirms space before you pay.
              </p>
            </div>
          </div>

          <div className="mt-16 mb-12 max-w-3xl">
            <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
              Three example bookings
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mt-4 max-w-xl">
              Each price below comes from the same booking engine that runs
              the booking page. Open one to change the answers and see a new
              price.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {examples.map((example, i) => {
              const result = exampleQuote(example.request);
              const isFeatured = example.name === "Growing business";
              return (
                <AnimatedItem key={example.name} delay={Math.min(i + 1, 3)} animateClass="animate-fade-up-slow">
                  <div
                    className={`tier-card relative rounded-2xl border p-6 h-full flex flex-col ${
                      isFeatured
                        ? "tier-card-featured bg-brand-500 text-black border-brand-500"
                        : "bg-surface-raised text-white border-white/5"
                    }`}
                  >
                    {isFeatured && (
                      <span className="top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 w-fit py-1 px-3 bg-black text-white text-[0.6875rem] font-bold uppercase tracking-wider rounded-full flex items-center gap-1 shadow-md z-10" style={{ position: "absolute" }}>
                        <Star size={12} weight="fill" className="text-brand-500" />
                        First discount
                      </span>
                    )}
                    <h3 className={`text-2xl font-bold font-display mb-2 ${isFeatured ? "text-black" : "text-white"}`}>
                      {example.name}
                    </h3>
                    <p className={`text-sm leading-relaxed mb-5 ${isFeatured ? "text-black/80" : "text-gray-400"}`}>
                      {example.detail}
                    </p>
                    <div className={`border-t pt-4 pb-3 flex justify-between items-center ${isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.6875rem] uppercase tracking-wider font-semibold ${isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Plays
                      </span>
                      <span className={`text-[2rem] font-bold font-display ${isFeatured ? "text-black" : "text-white"}`}>
                        {formatNumber(result.plays)}
                      </span>
                    </div>
                    <hr className={isFeatured ? "border-black/20" : "border-white/10"} />
                    <div className={`pt-3 pb-4 flex justify-between items-center ${isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.6875rem] uppercase tracking-wider font-semibold ${isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Price
                      </span>
                      <span className={`text-[2rem] font-bold font-display ${isFeatured ? "text-black" : "text-white"}`}>
                        {formatKes(result.priceKes)}
                      </span>
                    </div>
                    <hr className={isFeatured ? "border-black/20" : "border-white/10"} />
                    <div className={`pt-3 pb-4 flex justify-between items-center ${isFeatured ? "border-black/20" : "border-white/10"}`}>
                      <span className={`text-[0.6875rem] uppercase tracking-wider font-semibold ${isFeatured ? "text-black/70" : "text-gray-400"}`}>
                        Discount
                      </span>
                      <span className={`text-sm font-bold ${isFeatured ? "text-black" : "text-white"}`}>
                        {result.discountPercent > 0 ? `${result.discountPercent}% off` : "None"}
                      </span>
                    </div>
                    <Link
                      href={bookingHref(example)}
                      className={`group inline-flex items-center justify-center w-full px-6 py-3 rounded-full font-semibold text-sm tracking-wide transition-all duration-200 active:scale-[0.97] no-underline mt-2 ${
                        isFeatured
                          ? "btn-sweep bg-black text-white"
                          : "btn-sweep bg-white text-black hover:bg-brand-500 hover:text-black"
                      }`}
                    >
                      Book plays
                      <ArrowRight size={14} className="ml-1.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </Link>
                  </div>
                </AnimatedItem>
              );
            })}
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mt-8 text-center">
            Political, alcohol and betting adverts are approved by our manager
            one at a time, within Kenyan law.
          </p>
        </div>
      </AnimatedSection>

      <AnimatedSection className="relative py-20 lg:py-24 bg-ink overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/images/traffic-transit.webp')" }} />
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-white max-w-3xl mx-auto leading-snug">
            35,000&ndash;55,000+ impressions a day on one screen, at one junction.
          </p>
        </div>
      </AnimatedSection>

      <AnimatedSection className="py-20 lg:py-24 bg-ink">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimatedItem delay={1}>
            <div className="mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-white">
                Design and
                <br />
                build support
              </h2>
            </div>
          </AnimatedItem>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatedItem delay={2}>
                <SpotlightHover>
                <div className="mission-vision-card relative rounded-2xl border border-white/5 bg-surface-raised p-8 min-h-[320px] flex flex-col">
                  <div className="relative flex-1 flex flex-col">
                    <Plus size={40} weight="light" className="text-brand-500 mb-5" />
                    <h3 className="text-xl font-bold font-display text-white mb-3">
                      Large organisations
                    </h3>
                    <p className="text-base text-gray-400 leading-relaxed mb-6 flex-1">
                      Bookings of KES 50,000 or more can be paid by invoice. Up
                      to 3 adverts in one booking, a play report every week, and
                      one named KCA contact. Screen takeovers for more than{" "}
                      {DEFAULT_SETTINGS.maxPlaysPerAdvertiserPerHour} plays an
                      hour or a whole event.
                    </p>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-brand-400 transition-colors no-underline mt-auto"
                    >
                      Talk to us
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
                </SpotlightHover>
            </AnimatedItem>
            <AnimatedItem delay={3}>
                <SpotlightHover>
                <div className="mission-vision-card relative rounded-2xl border border-white/5 bg-surface-raised p-8 min-h-[320px] flex flex-col">
                  <div className="relative flex-1 flex flex-col">
                    <Play size={40} weight="fill" className="text-brand-500 mb-5" />
                    <h3 className="text-xl font-bold font-display text-white mb-3">
                      Design help
                    </h3>
                    <p className="text-base text-gray-400 leading-relaxed mb-6 flex-1">
                      A still advert from your logo, photo and words is KES
                      1,500. A simple moving advert up to 15 seconds is KES
                      5,000. Tell us what you sell and we will make it work on
                      the screen.
                    </p>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-brand-400 transition-colors no-underline mt-auto"
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
