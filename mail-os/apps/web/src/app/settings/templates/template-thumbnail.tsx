"use client";

import { useEffect, useRef, useState } from "react";
import s from "./page.module.css";

export function TemplateThumbnail({ html, name }: { html: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(size.width / 640, 1);
  return <div className={s.thumbnail}><div ref={box} className={s.canvas}>{scale > 0 && <iframe
    title={`${name} sample email`} srcDoc={html} sandbox="" tabIndex={-1} aria-hidden="true" scrolling="no"
    style={{ width: 640, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: "top left" }}
  />}</div></div>;
}
