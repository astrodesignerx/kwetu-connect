"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { STATUSES } from "@/lib/booking/status";
import type { BookingStatus } from "@/lib/booking/capacity";
import type { BookingListItem } from "@/lib/store/types";
import { number } from "@/components/booking/QuoteTotals";
import { dateRange } from "@/lib/format/dates";
import { X } from "@phosphor-icons/react";

export type PipelineCard = BookingListItem & { waiting: number; approved: number; advertCount: number };

function nextTask(booking: PipelineCard) {
  if (booking.status === "Quote") return booking.paymentNote ? "Payment note added, check payment" : "Awaiting payment";
  if (booking.waiting) return `${booking.waiting} advert${booking.waiting === 1 ? "" : "s"} to review`;
  if (booking.status === "Paid") return !booking.advertCount ? "Advert missing" : booking.approved ? "Ready for booking approval" : "Advert needs changes";
  if (booking.status === "Approved") return "Ready for the start date";
  if (booking.status === "Live") return "Scheduled to play";
  return booking.status === "Finished" ? "Campaign complete" : "Booking closed";
}

export default function PipelineBoard({ bookings, query, selected, status }: { bookings: PipelineCard[]; query: string; selected: string; status?: BookingStatus }) {
  const router = useRouter();
  const [dragged, setDragged] = useState("");
  const [over, setOver] = useState<BookingStatus | null>(null);
  const [pending, startTransition] = useTransition();
  const href = (reference: string, target?: BookingStatus) => {
    const params = new URLSearchParams(query);
    params.set("selected", reference);
    if (target) params.set("moveTo", target);
    return "/manage/bookings?" + params;
  };
  const card = (booking: PipelineCard, index: number) => <Link
    key={booking.reference} href={href(booking.reference)} scroll={false}
    className="pipeline-card" data-stage={booking.status} data-selected={selected === booking.reference}
    style={{ animationDelay: `${Math.min(index, 2) * 120}ms`, "--avatar": ["#a3e635", "#2dd4bf", "#fb923c", "#60a5fa", "#fb7185"][booking.business.charCodeAt(0) % 5] } as CSSProperties}
    draggable={!["Finished", "Cancelled"].includes(booking.status)}
    onDragStart={(event) => { event.dataTransfer.setData("text/plain", booking.reference); event.dataTransfer.effectAllowed = "move"; setDragged(booking.reference); }}
    onDragEnd={() => { setDragged(""); setOver(null); }}
    aria-label={`${booking.business}, ${booking.status}, KES ${number(booking.priceKes)}. Open booking`}
  >
    <span className="pipeline-card-head"><span className="business-avatar" aria-hidden="true">{booking.business.slice(0, 2).toUpperCase()}</span><span className="pipeline-card-length">{booking.request.lengthSeconds}s</span></span>
    <strong>{booking.business}</strong><small className="reference-link">{booking.reference}</small>
    <span className="pipeline-card-price">KES {number(booking.priceKes)}<small>{number(booking.plays)} plays</small></span>
    <span className="pipeline-card-dates">{dateRange(booking.request.startDate, booking.request.endDate)}</span>
    <span className="pipeline-task">{nextTask(booking)}</span>
    <span className="v2-stage-track" aria-hidden="true">{STATUSES.filter((stage) => stage !== "Cancelled").map((stage, index) => <i key={stage} data-filled={index <= STATUSES.indexOf(booking.status)} />)}</span>
  </Link>;
  return <div className="pipeline-results" aria-busy={pending} data-pending={pending}>
    <div className="pipeline-scroll" role="region" aria-label="Booking pipeline. Scroll to see all stages." tabIndex={0}>
      <div className={"pipeline-board" + (status ? " is-filtered" : "")}>
        {STATUSES.filter((stage) => stage !== "Cancelled" && (!status || stage === status)).map((stage) => {
          const items = bookings.filter((booking) => booking.status === stage);
          return <section className="pipeline-column" key={stage} data-stage={stage} data-over={over === stage}
            aria-label={`${stage}, ${items.length} bookings`}
            onDragOver={(event) => { if (dragged) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(stage); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
            onDrop={(event) => { event.preventDefault(); const booking = bookings.find((item) => item.reference === dragged); setDragged(""); setOver(null); if (booking && booking.status !== stage) startTransition(() => router.push(href(booking.reference, stage), { scroll: false })); }}>
            <header><h2><i aria-hidden="true" />{stage}</h2><span>{items.length}</span></header>
            <p className="pipeline-column-total">KES {number(items.reduce((sum, booking) => sum + booking.priceKes, 0))}</p>
            <div className="pipeline-stack">{items.map(card)}{!items.length && <p className="pipeline-empty">No {stage.toLowerCase()} bookings</p>}</div>
          </section>;
        })}
      </div>
    </div>
    {(!status || status === "Cancelled") && <section className="pipeline-cancelled" aria-label="Cancelled bookings"><h2>Cancelled <span>{bookings.filter((booking) => booking.status === "Cancelled").length}</span></h2><div className="pipeline-archive">{bookings.filter((booking) => booking.status === "Cancelled").map(card)}</div>{status === "Cancelled" && !bookings.some((booking) => booking.status === "Cancelled") && <p className="empty-state">No cancelled bookings match these filters.</p>}</section>}
  </div>;
}

export function PipelineInspector({ title, closeUrl, reference, children }: { title: string; closeUrl: string; reference: string; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!value) { setOpen(false); timer.current = setTimeout(() => router.push(closeUrl, { scroll: false }), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200); } }}><Dialog.Portal>
    <Dialog.Overlay className="ns-sheet-overlay v2-inspector-overlay" />
    <Dialog.Content className="timetable-sheet pipeline-inspector nightshift" aria-describedby={undefined} data-lenis-prevent
      onCloseAutoFocus={(event) => { event.preventDefault(); [...document.querySelectorAll<HTMLAnchorElement>(".pipeline-card")].find((card) => new URL(card.href).searchParams.get("selected") === reference)?.focus(); }}>
      <div className="sheet-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="quiet-button" aria-label="Close booking"><X size={18} aria-hidden="true" /></Dialog.Close></div>
      <Link href={"/manage/bookings/" + reference} className="quiet-button">Open full booking</Link>
      <div className="booking-detail-panel">{children}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
