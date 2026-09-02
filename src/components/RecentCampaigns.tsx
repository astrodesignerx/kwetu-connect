"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import { campaigns } from "@/data/campaigns";

function MarqueeCard({ campaign }: { campaign: (typeof campaigns)[number] }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {});
  };

  const handleLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    // keep last frame; don't reset so poster doesn't flash on quick re-hover
  };

  return (
    <div
      className="relative flex-none w-[300px] sm:w-[380px] lg:w-[440px] aspect-video overflow-hidden rounded-xl bg-surface-base border border-white/10 select-none"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      <video
        ref={videoRef}
        src={campaign.video}
        poster={campaign.cover}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`${campaign.title} — ${campaign.client}`}
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 sm:p-4">
        <span className="inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider bg-black/50 backdrop-blur-sm mb-1">
          {campaign.category}
        </span>
        <p className="text-sm font-bold text-white leading-none truncate">{campaign.title}</p>
        <p className="text-xs text-gray-300 truncate">{campaign.client}</p>
      </div>
    </div>
  );
}

export default function RecentCampaigns() {
  const loop = [...campaigns, ...campaigns];
  const viewportRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isHoveringRef = useRef(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const speed = 0.6; // px per frame at 60fps; ~60s per half-loop

    const tick = () => {
      if (!isHoveringRef.current && !isDraggingRef.current) {
        el.scrollLeft += speed;
        // seamless wrap: duplicated content is exactly 2×; reset at half
        const half = el.scrollWidth / 2;
        if (half > 0 && el.scrollLeft >= half) {
          el.scrollLeft -= half;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

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

      <AnimatedItem delay={3}>
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-r from-black to-transparent z-[1]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 sm:w-16 bg-gradient-to-l from-black to-transparent z-[1]"
          />

          <div
            ref={viewportRef}
            className="overflow-x-auto cursor-grab active:cursor-grabbing select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            onMouseEnter={() => {
              isHoveringRef.current = true;
            }}
            onMouseLeave={() => {
              isHoveringRef.current = false;
              isDraggingRef.current = false;
            }}
            onPointerDown={(e) => {
              isDraggingRef.current = true;
              isHoveringRef.current = true;
              startXRef.current = e.clientX;
              startScrollRef.current = viewportRef.current?.scrollLeft ?? 0;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!isDraggingRef.current) return;
              const dx = e.clientX - startXRef.current;
              if (viewportRef.current) {
                viewportRef.current.scrollLeft = startScrollRef.current - dx;
              }
            }}
            onPointerUp={(e) => {
              isDraggingRef.current = false;
              // stay paused while pointer is still over the viewport; mouseLeave will resume
              try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              } catch {}
            }}
            onPointerCancel={() => {
              isDraggingRef.current = false;
              isHoveringRef.current = false;
            }}
          >
            <div className="flex w-max gap-4 sm:gap-5 pr-4 sm:pr-5">
              {loop.map((campaign, idx) => (
                <MarqueeCard key={`${campaign.slug}-${idx}`} campaign={campaign} />
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-gray-500">Hover a card to play · Drag to scroll</p>
      </AnimatedItem>
    </AnimatedSection>
  );
}
