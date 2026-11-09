"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CaretDown, Check, Copy, DotsThree } from "@phosphor-icons/react";
import { STATUSES } from "@/lib/booking/status";
import type { BookingStatus } from "@/lib/booking/capacity";
import type { NextAction } from "@/lib/booking/pipeline";
import { useBookingTab } from "./BookingDetailTabs";

// A small popover that closes on outside press and Escape.
function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); box.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  return [open, setOpen, box] as const;
}

export default function BookingHeader({ business, reference, status, action, moveBase, compact, children }: { business: string; reference: string; status: BookingStatus; action: NextAction | null; moveBase: string; compact: boolean; children: ReactNode }) {
  const goTo = useBookingTab();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moveOpen, setMoveOpen, moveBox] = usePopover();
  const [moreOpen, setMoreOpen, moreBox] = usePopover();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const moveUrl = (to: BookingStatus) => moveBase + (moveBase.endsWith("?") ? "" : "&") + "moveTo=" + to;
  const closed = status === "Finished" || status === "Cancelled";
  const stages = STATUSES.filter((stage) => stage !== "Cancelled");
  const copy = async () => {
    try { await navigator.clipboard.writeText(reference); } catch {
      // No clipboard permission (for example an embedded browser): fall back to selecting a hidden field.
      const field = document.createElement("textarea");
      field.value = reference; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0";
      document.body.append(field); field.select();
      const done = document.execCommand("copy");
      field.remove();
      if (!done) return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  const Name = compact ? "strong" : "h1";
  return <header className="v2-popup-head">
    <div className="v2-popup-id">
      <span className="v2-popup-tile" aria-hidden="true">{business.slice(0, 2).toUpperCase()}</span>
      <div><Name className="v2-popup-name">{business}</Name>
        <button type="button" className="v2-copy-ref" onClick={copy} aria-label={`Copy reference ${reference}`}><code>{reference}</code>{copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}<span className="v2-copied" data-show={copied} role="status">{copied ? "Copied" : ""}</span></button>
      </div>
    </div>
    <ol className="v2-stepper" aria-label={status === "Cancelled" ? "Booking stage, cancelled" : "Booking stage"}>{stages.map((stage, index) => <li key={stage} aria-current={stage === status ? "step" : undefined} data-done={status !== "Cancelled" && index < STATUSES.indexOf(status)}><i aria-hidden="true" /><span>{stage}</span></li>)}</ol>
    <div className="v2-popup-actions">
      {action && (action.kind === "move" ? <Link className="v2-primary" href={moveUrl(action.to)} scroll={false}>{action.label}</Link>
        : action.kind === "link" ? <Link className="v2-primary" href={action.href}>{action.label}</Link>
        : <button type="button" className="v2-primary" onClick={() => goTo(action.kind === "payment" ? "Payment" : "Contact")}>{action.label}</button>)}
      {!closed && <div className="v2-pop" ref={moveBox}>
        <button type="button" className="v2-secondary" aria-expanded={moveOpen} onClick={() => { setMoveOpen(!moveOpen); setMoreOpen(false); }}>Move to<CaretDown size={12} aria-hidden="true" /></button>
        {moveOpen && <div className="v2-pop-panel v2-pop-move" role="group" aria-label="Move to another stage">{children}</div>}
      </div>}
      {(compact || !closed) && <div className="v2-pop" ref={moreBox}>
        <button type="button" className="v2-secondary v2-more" aria-expanded={moreOpen} aria-label="More" onClick={() => { setMoreOpen(!moreOpen); setMoveOpen(false); }}><DotsThree size={18} weight="bold" aria-hidden="true" /></button>
        {moreOpen && <div className="v2-pop-panel v2-pop-menu">
          {compact && <Link href={"/manage/bookings/" + reference}>Open full booking</Link>}
          {!closed && <Link href={moveUrl("Cancelled")} scroll={false} data-danger="true">Cancel booking</Link>}
        </div>}
      </div>}
    </div>
  </header>;
}
