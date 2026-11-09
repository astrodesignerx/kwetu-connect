"use client";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";

const TABS = ["Summary", "Advert", "Payment", "Contact", "History"];
const TabsContext = createContext<(tab: string) => void>(() => {});
/** Lets the header (a sibling of the panels) switch tab, for example to Contact. */
export const useBookingTab = () => useContext(TabsContext);
export default function BookingDetailTabs({ panels, header, confirm, initialTab }: { panels: ReactNode[]; header?: ReactNode; confirm?: ReactNode; initialTab?: string }) {
  const id = useId();
  const [selected, setSelected] = useState(Math.max(0, TABS.indexOf(initialTab ?? "")));
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const goTo = (tab: string) => { const index = TABS.indexOf(tab); if (index >= 0) { setSelected(index); buttons.current[index]?.focus(); } };
  return <TabsContext.Provider value={goTo}>{header}{confirm}<div className="v2-detail-tabs"><div role="tablist" aria-label="Booking information">{TABS.map((label, index) => <button type="button" key={label} ref={(element) => { buttons.current[index] = element; }} role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => {
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next !== null) { event.preventDefault(); setSelected(next); buttons.current[next]?.focus(); }
  }}>{label}</button>)}</div>{panels.map((panel, index) => <div key={index} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index} tabIndex={0}><div className="v2-detail-tab-content">{panel}</div></div>)}</div></TabsContext.Provider>;
}
