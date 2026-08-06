"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Play, X } from "@phosphor-icons/react";
import type { Campaign } from "@/data/campaigns";

export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canHover = useRef(false);
  const reduceMotion = useRef(false);
  const warmedRef = useRef(false);

  useEffect(() => {
    canHover.current = window.matchMedia("(hover: hover)").matches;
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Warm the video when the card approaches the viewport so the first hover
  // starts playback instantly instead of waiting on a fresh download.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !campaign.video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !warmedRef.current) {
          warmedRef.current = true;
          const v = videoRef.current;
          if (v) {
            v.preload = "auto";
            v.load();
          }
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [campaign.video]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleMouseEnter = () => {
    if (!campaign.video || !canHover.current || reduceMotion.current) return;
    videoRef.current?.play().catch(() => {});
  };
  const handleMouseLeave = () => {
    videoRef.current?.pause();
  };

  return (
    <>
      <div
        ref={containerRef}
        className="group relative rounded-2xl overflow-hidden border border-white/5 bg-surface-base"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="relative aspect-video overflow-hidden">
          <Image
            src={campaign.cover}
            alt={campaign.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          {campaign.video && (
            <>
              <video
                ref={videoRef}
                src={campaign.video}
                muted
                playsInline
                loop
                preload="metadata"
                onPlaying={() => setVideoReady(true)}
                onPause={() => setVideoReady(false)}
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  videoReady ? "opacity-0 group-hover:opacity-100" : "opacity-0"
                }`}
              />
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`Play ${campaign.title}`}
                className="absolute inset-0 flex items-center justify-center cursor-pointer border-none transition-opacity duration-300 opacity-100 group-hover:opacity-0 focus-visible:opacity-100"
              >
                <span className="flex items-center justify-center w-14 h-14 rounded-full bg-brand-500 text-black shadow-lg">
                  <Play size={22} weight="fill" />
                </span>
              </button>
            </>
          )}
          <span className="absolute top-3 left-3 inline-block px-2 py-0.5 rounded text-[0.6875rem] font-semibold text-brand-500 uppercase tracking-wider bg-black/50 backdrop-blur-sm">
            {campaign.category}
          </span>
        </div>
        <div className="p-5">
          <h3 className="text-base font-bold text-white mb-1">{campaign.title}</h3>
          <p className="text-sm text-gray-400">{campaign.client}</p>
          <p className="text-xs text-gray-500 mt-2">{campaign.term}</p>
        </div>
      </div>

      {open && campaign.video && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={campaign.title}
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-3xl rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl animate-modal-in">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">{campaign.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {campaign.client} · {campaign.term}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-white transition-colors cursor-pointer bg-transparent border-none p-1.5 -m-1.5"
              >
                <X size={20} />
              </button>
            </div>
            <video
              key={campaign.video}
              src={campaign.video}
              controls
              playsInline
              autoPlay
              className="w-full aspect-video bg-black"
            />
            <div className="px-5 py-4">
              <p className="text-sm text-gray-300 leading-relaxed">{campaign.description}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
