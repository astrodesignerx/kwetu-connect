"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { DeskFilter } from "@/lib/advert-desk";

export type QueueTab = { id: DeskFilter; label: string; count: number; attention: boolean };

// Every tab's tiles arrive with the page, so switching tab never asks the server and the review above stays put.
export default function AdvertQueueTabs({ tabs, filter, panels }: { tabs: QueueTab[]; filter: DeskFilter; panels: Partial<Record<DeskFilter, ReactNode>> }) {
  const [active, setActive] = useState(filter);
  const [urlFilter, setUrlFilter] = useState(filter);
  // The address only changes when a tile is opened or on browser back, and then the tab follows it.
  if (urlFilter !== filter) { setUrlFilter(filter); setActive(filter); }
  const baseId = useId();
  const index = tabs.findIndex((tab) => tab.id === active);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = tabs.length - 1;
    const next = event.key === "ArrowRight" ? (index >= last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index <= 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(tabs[next].id);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return <>
    <div className="advert-tabs" role="tablist" aria-label="Advert queue" onKeyDown={onKeyDown}>
      <span className="advert-tabs-pill" data-hidden={index < 0} style={{ "--tab": Math.max(index, 0) } as CSSProperties} aria-hidden="true" />
      {tabs.map((tab, position) => <button key={tab.id} type="button" role="tab" id={`${baseId}-${tab.id}`} aria-selected={tab.id === active} aria-controls={`${baseId}-panel`} tabIndex={position === Math.max(index, 0) ? 0 : -1} data-attention={tab.attention} data-empty={tab.count === 0} onClick={() => setActive(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
    </div>
    <div key={active} id={`${baseId}-panel`} className="advert-tab-panel" role="tabpanel" aria-labelledby={index >= 0 ? `${baseId}-${active}` : undefined} aria-label={index < 0 ? "All open bookings" : undefined}>{panels[active]}</div>
  </>;
}
