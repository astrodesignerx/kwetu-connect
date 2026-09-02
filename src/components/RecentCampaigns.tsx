import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import { campaigns } from "@/data/campaigns";

export default function RecentCampaigns() {
  // Duplicate for seamless -50% loop. 6 unique → 12 rendered.
  const loop = [...campaigns, ...campaigns];

  return (
    <AnimatedSection className="py-20 lg:py-24 bg-black overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-12">
          <div>
            <AnimatedItem delay={1}>
              <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-white">
                Recently on screen
              </h2>
            </AnimatedItem>
            <AnimatedItem delay={2}>
              <p className="text-sm text-gray-400 leading-relaxed mt-4 max-w-xl">
                Campaigns running now and recently on our LED billboard at Kisumu Ndogo Road.
              </p>
            </AnimatedItem>
          </div>
          <AnimatedItem delay={2}>
            <Link
              href="/campaigns"
              className="group inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-brand-400 transition-colors no-underline mt-6 sm:mt-0 shrink-0"
            >
              View all campaigns
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
            </Link>
          </AnimatedItem>
        </div>
      </div>

      {/* Marquee viewport — edge fades hide the seam, hover pauses the loop */}
      <AnimatedItem delay={3}>
        <div className="group relative overflow-hidden">
          {/* Edge fade masks — masks the -50% wrap seam on desktop; hidden on reduced-motion where we fall back to scroll */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-r from-black to-transparent z-[1]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-l from-black to-transparent z-[1]"
          />

          <div className="flex w-max gap-4 sm:gap-5 animate-marquee group-hover:[animation-play-state:paused]">
            {loop.map((campaign, idx) => (
              <div
                key={`${campaign.slug}-${idx}`}
                className="relative flex-none w-[300px] sm:w-[380px] lg:w-[440px] aspect-video overflow-hidden rounded-xl bg-surface-base border border-white/10"
              >
                <video
                  src={campaign.video}
                  poster={campaign.cover}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={`${campaign.title} — ${campaign.client}`}
                  className="h-full w-full object-cover"
                />
                {/* Subtle bottom scrim + meta so fill cards still read as adverts */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 sm:p-4">
                  <span className="inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider bg-black/50 backdrop-blur-sm mb-1">
                    {campaign.category}
                  </span>
                  <p className="text-sm font-bold text-white leading-none truncate">{campaign.title}</p>
                  <p className="text-xs text-gray-300 truncate">{campaign.client}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedItem>
    </AnimatedSection>
  );
}
