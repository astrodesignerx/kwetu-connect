"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Play, X, ArrowsOut } from "@phosphor-icons/react";
import { campaigns } from "@/data/campaigns";

export default function CampaignTheater() {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const featuredRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const campaign = campaigns[active] ?? campaigns[0];

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Replay the featured HD clip whenever the selection changes.
  useEffect(() => {
    const v = featuredRef.current;
    if (!v || reduceMotion) return;
    v.load();
    v.play().catch(() => {});
  }, [active, reduceMotion]);

  const go = useCallback(
    (dir: 1 | -1) => {
      setActive((i) => (i + dir + campaigns.length) % campaigns.length);
    },
    []
  );

  // Fullscreen player: lock scroll, Esc to close, arrows to navigate.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, go]);

  if (!campaign) return null;
  const hdSrc = campaign.videoHd ?? campaign.video;

  return (
    <>
      {/* Featured screen with ambient poster glow */}
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute -inset-6 sm:-inset-8 overflow-hidden">
          <Image
            src={campaign.cover}
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-25 blur-3xl scale-110"
          />
        </div>

        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-surface-raised shadow-2xl">
          <div className="relative aspect-video bg-black">
            {reduceMotion ? (
              <Image
                src={campaign.cover}
                alt={`${campaign.title} — ${campaign.client}`}
                fill
                sizes="(min-width: 1024px) 80vw, 100vw"
                className="object-cover"
                priority
              />
            ) : (
              <video
                key={campaign.slug}
                ref={featuredRef}
                src={hdSrc}
                poster={campaign.cover}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={`${campaign.title} — ${campaign.client}`}
                className="h-full w-full object-cover"
              />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider bg-black/50 backdrop-blur-sm">
                {campaign.category}
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-gray-200 uppercase tracking-wider bg-black/50 backdrop-blur-sm">
                {campaign.term}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">
                  {campaign.title}
                </p>
                <p className="text-sm text-gray-300 mt-1 truncate">
                  {campaign.client}
                </p>
                <p className="text-sm text-gray-400 leading-relaxed mt-2 max-w-2xl line-clamp-2">
                  {campaign.description}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="group btn-sweep inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-500 text-black text-sm font-semibold transition-all duration-200 cursor-pointer border-none no-underline"
                >
                  <ArrowsOut size={16} weight="bold" />
                  Watch fullscreen
                </button>
                <Link
                  href="/contact"
                  className="btn-outline inline-flex items-center px-6 py-3 rounded-full border border-white/25 text-sm font-semibold text-gray-200 hover:bg-white/10 no-underline"
                >
                  Book this slot
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filmstrip selector — posters only so only the feature decodes */}
      <div
        role="listbox"
        aria-label="Choose a campaign to preview"
        className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4"
      >
        {campaigns.map((c, i) => {
          const isActive = i === active;
          return (
            <button
              key={c.slug}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => setActive(i)}
              onMouseEnter={() => {
                // Warm the HD file so the featured swap starts instantly.
                if (!c.videoHd) return;
                const link = document.createElement("link");
                link.rel = "preload";
                link.as = "video";
                link.href = c.videoHd;
                document.head.appendChild(link);
                setTimeout(() => link.remove(), 4000);
              }}
              className={`group relative rounded-xl overflow-hidden border text-left cursor-pointer bg-surface-raised transition-all duration-200 p-0 ${
                isActive
                  ? "border-brand-500 ring-2 ring-brand-500/60"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="relative block aspect-video overflow-hidden">
                <Image
                  src={c.cover}
                  alt={`${c.title} — ${c.client}`}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  className={`object-cover transition-transform duration-500 ${
                    isActive ? "" : "group-hover:scale-105"
                  }`}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                {!isActive && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex items-center justify-center w-11 h-11 rounded-full bg-black/60 text-brand-500 border border-white/20 backdrop-blur-sm">
                      <Play size={18} weight="fill" />
                    </span>
                  </span>
                )}
                <span className="absolute top-2 left-2 inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider bg-black/50 backdrop-blur-sm">
                  {c.category}
                </span>
              </span>
              <span className="block p-3">
                <span className={`block text-sm font-bold leading-none truncate ${isActive ? "text-brand-500" : "text-white"}`}>
                  {c.title}
                </span>
                <span className="block text-xs text-gray-400 truncate mt-1">{c.client}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Fullscreen immersive player */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${campaign.title} fullscreen player`}
        >
          <div
            className="absolute inset-0 bg-black/95 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />
          {/* Ambient glow behind the player */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <Image
              src={campaign.cover}
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-20 blur-3xl scale-110"
            />
          </div>

          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous campaign"
            className="absolute left-2 sm:left-6 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-brand-500 hover:text-black transition-colors cursor-pointer border border-white/15"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next campaign"
            className="absolute right-2 sm:right-6 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-brand-500 hover:text-black transition-colors cursor-pointer border border-white/15"
          >
            <ArrowRight size={20} weight="bold" />
          </button>

          <div className="relative w-full max-w-6xl mx-4 sm:mx-8 rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl animate-modal-in max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider">
                  {campaign.category} · {campaign.term}
                </p>
                <h3 className="text-base sm:text-lg font-bold text-white truncate">{campaign.title}</h3>
                <p className="text-xs text-gray-400 truncate">{campaign.client}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close fullscreen player"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors cursor-pointer border border-white/15 shrink-0"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
            <video
              key={campaign.slug}
              src={hdSrc}
              poster={campaign.cover}
              controls
              playsInline
              autoPlay
              preload="auto"
              className="w-full aspect-video bg-black shrink-0"
            />
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 overflow-y-auto">
              <p className="text-sm text-gray-300 leading-relaxed flex-1">{campaign.description}</p>
              <Link
                href="/contact"
                className="group btn-sweep inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-500 text-black text-sm font-semibold transition-all duration-200 no-underline shrink-0"
              >
                Book this slot
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
