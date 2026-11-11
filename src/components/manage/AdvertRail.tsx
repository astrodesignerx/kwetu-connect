"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

/** The sideways advert strip, with arrows that appear only when there is more to see. */
export default function AdvertRail({ children }: { children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    const selected = node.querySelector<HTMLElement>('[aria-current="true"]');
    if (selected) {
      const box = node.getBoundingClientRect();
      const tile = selected.getBoundingClientRect();
      if (tile.left < box.left || tile.right > box.right) node.scrollTo({ left: node.scrollLeft + tile.left - box.left - 12, behavior: "instant" });
    }
    const sync = () => {
      const max = node.scrollWidth - node.clientWidth - 2;
      setEdges({ start: node.scrollLeft <= 2, end: node.scrollLeft >= max });
    };
    node.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => { node.removeEventListener("scroll", sync); observer.disconnect(); };
  }, []);

  const move = (direction: number) => { const node = list.current; if (node) node.scrollBy({ left: direction * node.clientWidth * 0.8 }); };

  return <>
    <div className="advert-rail-nav" data-idle={edges.start && edges.end}>
      <button type="button" aria-label="Scroll the queue back" disabled={edges.start} onClick={() => move(-1)}><CaretLeft size={14} weight="bold" aria-hidden="true" /></button>
      <button type="button" aria-label="Scroll the queue forward" disabled={edges.end} onClick={() => move(1)}><CaretRight size={14} weight="bold" aria-hidden="true" /></button>
    </div>
    <div ref={list} className="advert-queue-list" data-end={edges.end}>{children}</div>
  </>;
}
