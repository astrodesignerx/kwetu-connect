"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Pause, Play, SpeakerSlash } from "@phosphor-icons/react";
import { quadMatrix } from "@/lib/advert-desk";
import { SCREEN } from "@/lib/advert-checks";

export type Measurement = { width: number; height: number; duration: number | null };
type View = "full" | "pixels" | "safe" | "road";
const VIEWS: [View, string][] = [["full", "Full size"], ["pixels", "LED pixels"], ["safe", "Safe area"], ["road", "From the road"]];
// The advert is laid out 1200 x 675 and scaled to the stage. In the road view it is bent onto the screen in the evening photo (corners read off that photo, in the photo's own 1200 px width, cropped to 16:9 from y = 90).
const FRAME = { w: 1200, h: 675 };
const ROAD = quadMatrix(FRAME.w, FRAME.h, [[416, 142], [797, 86], [797, 353], [402, 376]]).css;
const clock = (seconds: number) => { const whole = Math.max(0, Math.floor(seconds)); return String(Math.floor(whole / 60)).padStart(2, "0") + ":" + String(whole % 60).padStart(2, "0"); };

export default function AdvertStage({ url, video, fileName, unavailable, onMeasured, onFailed }: { url: string | null; video: boolean; fileName: string; unavailable: ReactNode; onMeasured: (value: Measurement) => void; onFailed: () => void }) {
  const [view, setView] = useState<View>("full");
  const [fit, setFit] = useState(0.3);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [paused, setPaused] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const size = () => setFit(node.clientWidth / FRAME.w);
    size();
    const watch = new ResizeObserver(size);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  // A server-rendered video can finish loading its metadata before React attaches onLoadedMetadata, so replay the event once.
  useEffect(() => { const media = player.current; if (media && media.readyState >= 1) media.dispatchEvent(new Event("loadedmetadata")); }, []);
  const toggle = () => { const media = player.current; if (!media) return; if (media.paused) void media.play().catch(() => undefined); else media.pause(); };
  return <div className="advert-stage-block">
    <div className="advert-stage" ref={stage} data-view={view} style={{ "--fit": fit, "--road": ROAD } as CSSProperties}>
      <div className="advert-road"><Image src="/images/evening-billboard.webp" alt="" fill sizes="(max-width: 1023px) 100vw, 640px" /></div>
      <div className="advert-frame">
        {url ? video
          ? <video ref={player} muted playsInline preload="metadata" src={url} aria-label={fileName}
            onLoadedMetadata={(event) => { const media = event.currentTarget; setLength(Number.isFinite(media.duration) ? media.duration : 0); onMeasured({ width: media.videoWidth, height: media.videoHeight, duration: media.duration }); }}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onEnded={() => setPaused(true)} onError={onFailed} />
          : <Image fill unoptimized sizes="800px" src={url} alt={fileName} onLoad={(event) => { const media = event.currentTarget; onMeasured({ width: media.naturalWidth, height: media.naturalHeight, duration: null }); }} onError={onFailed} />
          : unavailable}
      </div>
      <i className="advert-leds" aria-hidden="true" /><i className="advert-safe" aria-hidden="true" />
      <span className="advert-corner">{SCREEN.width} x {SCREEN.height}</span>
    </div>
    {url && video && <div className="advert-player">
      <button type="button" onClick={toggle} aria-label={paused ? "Play" : "Pause"}>{paused ? <Play size={14} weight="fill" aria-hidden="true" /> : <Pause size={14} weight="fill" aria-hidden="true" />}</button>
      <span className="advert-time">{clock(time)} / {clock(length)}</span>
      <input type="range" min={0} max={length || 0} step={0.1} value={Math.min(time, length || 0)} disabled={!length} aria-label="Seek" aria-valuetext={clock(time) + " of " + clock(length)} style={{ "--pct": length ? (time / length) * 100 + "%" : "0%" } as CSSProperties}
        onChange={(event) => { const media = player.current; if (media) { media.currentTime = Number(event.target.value); setTime(media.currentTime); } }} />
      <span className="advert-nosound"><SpeakerSlash size={14} aria-hidden="true" />No sound on the screen</span>
    </div>}
    <div className="advert-views" role="group" aria-label="Preview view">{VIEWS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
    <p className="advert-caption" data-show={view === "road"} aria-hidden={view !== "road"}><b>From the road</b>, simulated on the evening photo</p>
  </div>;
}
