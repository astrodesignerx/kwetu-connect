"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fitFrame } from "@/lib/mail/frame";
import { messageDoc } from "@/lib/mail/thread";

/**
 * One email, on white paper in both themes, inside a frame with scripts switched off so its HTML and CSS
 * cannot touch the page. The frame grows to fit the message; links open in a new tab.
 */
export default function MessageFrame({ html, text, title }: { html: string | null; text: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const doc = useMemo(() => messageDoc({ html, text }).doc, [html, text]);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let stop = () => undefined as void;
    const ready = () => { stop(); stop = fitFrame(el, setHeight, { min: 60 }); };
    el.addEventListener("load", ready);
    if (el.contentDocument?.readyState === "complete") ready();
    return () => { el.removeEventListener("load", ready); stop(); };
  }, [doc]);
  return <iframe ref={frame} className="mg-mail-frame" title={title} srcDoc={doc} style={{ height }} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" />;
}
