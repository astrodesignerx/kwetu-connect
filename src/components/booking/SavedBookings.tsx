"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ClockCounterClockwise, LinkSimple, MagnifyingGlass } from "@phosphor-icons/react";

/** What this browser keeps about each booking it has seen. Nothing here is private: the reference is the key. */
export type SavedBooking = { reference: string; priceKes: number; plays: number; startDate: string; endDate: string; status: string; savedAt: string };
const KEY = "kca-bookings";
const EVENT = "kca-bookings-change";
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function readRaw() { try { return window.localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } }
function parse(raw: string): SavedBooking[] { try { const list = JSON.parse(raw); return Array.isArray(list) ? list : []; } catch { return []; } }
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback); window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
function write(list: SavedBooking[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12))); window.dispatchEvent(new Event(EVENT)); } catch { /* private mode: the link still works */ }
}

/** Put this booking at the top of the list on this device; drop the one it replaced. */
export function RememberBooking({ booking, replaces }: { booking: Omit<SavedBooking, "savedAt">; replaces?: string }) {
  const { reference, priceKes, plays, startDate, endDate, status } = booking;
  useEffect(() => {
    const rest = parse(readRaw()).filter((b) => b.reference !== reference && b.reference !== replaces);
    write([{ reference, priceKes, plays, startDate, endDate, status, savedAt: new Date().toISOString() }, ...rest]);
  }, [reference, priceKes, plays, startDate, endDate, status, replaces]);
  return null;
}

/** Top bar button: bookings made on this device, plus a way to find one made elsewhere. */
export function MyBookings() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");
  const list = parse(raw).filter((b) => b.status !== "Cancelled");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return <div className="my-bookings" ref={box}>
    <button type="button" className="my-bookings-button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
      <ClockCounterClockwise size={16} aria-hidden="true" /><span className="my-bookings-label">Your bookings</span>
      {list.length > 0 && <b className="my-bookings-count">{list.length}</b>}
    </button>
    {open && <div className="my-bookings-panel" role="region" aria-label="Your bookings">
      <p className="quote-eyebrow">ON THIS DEVICE</p>
      {list.length ? <ul>{list.map((b, index) => <li key={b.reference} style={{ animationDelay: `${index * 35}ms` }}>
        <Link href={`/book/q/${b.reference}`} onClick={() => setOpen(false)}>
          <span className="my-booking-top"><span className={`my-booking-status is-${b.status.toLowerCase()}`}>{b.status === "Quote" ? "Waiting for payment" : b.status}</span><ArrowRight size={14} aria-hidden="true" /></span>
          <strong>KES {b.priceKes.toLocaleString("en-GB")}</strong>
          <small>{b.plays.toLocaleString("en-GB")} plays, {day(b.startDate)} to {day(b.endDate)}</small>
        </Link>
      </li>)}</ul> : <p className="my-bookings-empty">Bookings you make or open on this device show here.</p>}
      <Link className="my-bookings-find" href="/book/find" onClick={() => setOpen(false)}><MagnifyingGlass size={15} aria-hidden="true" />Find a booking from another device</Link>
    </div>}
  </div>;
}

/** "Keep this link": the page address is the key to come back, so make it easy to copy. */
export function KeepLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(url); setState("copied"); } catch { setState("failed"); }
    window.setTimeout(() => setState("idle"), 1800);
  }
  return <div className="keep-link">
    <div><p className="quote-eyebrow">KEEP THIS LINK</p><p>It opens this booking any time, on any device. This browser also keeps it under Your bookings.</p></div>
    <button type="button" onClick={copy} data-state={state}><LinkSimple size={15} aria-hidden="true" />{state === "copied" ? "Copied" : state === "failed" ? "Select the address bar" : "Copy link"}</button>
  </div>;
}
