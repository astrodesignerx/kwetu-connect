"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BuildingOffice,
  CalendarCheck,
  GraduationCap,
  ShoppingCart,
} from "@phosphor-icons/react";

const categories = [
  {
    image: "/images/retail.webp",
    label: "Retail & Supermarkets",
    Icon: ShoppingCart,
    pitch:
      "Weekly offers and footfall drivers, live at the junction drivers already watch.",
  },
  {
    image: "/images/real-estate.webp",
    label: "Real Estate Developers",
    Icon: BuildingOffice,
    pitch:
      "Site launches and show-day pushes that stick with commuters on every pass.",
  },
  {
    image: "/images/schools.webp",
    label: "Schools & Colleges",
    Icon: GraduationCap,
    pitch:
      "Intake and open-day campaigns parents see twice a day on the school run.",
  },
  {
    image: "/images/events.webp",
    label: "Events & Promotions",
    Icon: CalendarCheck,
    pitch:
      "Countdown hype that fills seats in the final week before the gates open.",
  },
];

export default function WhoWeWorkWith() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = categories[active] ?? categories[0];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (active + dir + categories.length) % categories.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Who we work with"
        onKeyDown={onKeyDown}
        className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {categories.map((category, i) => {
          const isActive = i === active;
          return (
            <button
              key={category.label}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="who-we-work-with-panel"
              id={`who-tab-${i}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(i)}
              className={`inline-flex shrink-0 items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer border ${
                isActive
                  ? "bg-black border-black text-white"
                  : "bg-transparent border-black/15 text-gray-600 hover:border-black/40 hover:text-black"
              }`}
            >
              <category.Icon size={18} weight={isActive ? "fill" : "regular"} />
              {category.label}
            </button>
          );
        })}
      </div>

      <div
        id="who-we-work-with-panel"
        role="tabpanel"
        aria-labelledby={`who-tab-${active}`}
        className="mt-6 rounded-2xl overflow-hidden border border-black/10 bg-white shadow-sm"
      >
        <div
          key={current.label}
          className="grid grid-cols-1 md:grid-cols-2 min-h-[280px] sm:min-h-[320px] animate-fade-up"
        >
          <div className="relative min-h-[200px] md:min-h-0">
            <Image
              src={current.image}
              alt={current.label}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-white/40" />
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <span className="inline-flex w-fit items-center gap-2 text-[0.6875rem] font-semibold text-brand-700 uppercase tracking-[0.15em] mb-3">
              <current.Icon size={16} weight="fill" />
              {current.label}
            </span>
            <p className="text-base sm:text-lg text-gray-700 leading-relaxed">
              {current.pitch}
            </p>
            <Link
              href="/campaigns"
              className="group mt-5 inline-flex w-fit items-center gap-2 text-sm font-semibold text-black hover:text-brand-600 transition-colors no-underline"
            >
              See it on screen
              <ArrowRight
                size={14}
                className="group-hover:translate-x-0.5 transition-transform duration-200"
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
