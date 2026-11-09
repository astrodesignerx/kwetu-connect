"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { STATUSES } from "@/lib/booking/status";
import type { BookingStatus } from "@/lib/booking/capacity";
import { avatarColour, liveProgress, nextTask, type PipelineCard } from "@/lib/booking/pipeline";
import { number } from "@/components/booking/QuoteTotals";
import { dateRange, dayDate, shortDate } from "@/lib/format/dates";
import { Plus, X } from "@phosphor-icons/react";

export type { PipelineCard };

type Helper = { key: string; title: string; line: string; note: string; href: string };
// Next steps for a short column, taken from the bookings already in it. Nothing is shown unless the data says it.
function helpersFor(stage: BookingStatus, items: PipelineCard[], today: string, open: (reference: string) => string): Helper[] {
  const list: Helper[] = [];
  for (const booking of items) {
    const start = "Starts " + dayDate(booking.request.startDate);
    if (stage === "Paid" && booking.waiting) list.push({ key: booking.reference, title: `${booking.waiting} advert${booking.waiting === 1 ? "" : "s"} to review`, line: `${booking.business} | ${start}`, note: "Review in Adverts", href: "/manage/adverts?q=" + encodeURIComponent(booking.reference) });
    else if (stage === "Paid" && !booking.advertCount) list.push({ key: booking.reference, title: "Advert missing", line: `${booking.business} | ${start}`, note: "Remind them from the Contact tab", href: open(booking.reference) });
    else if (stage === "Approved") list.push({ key: booking.reference, title: "Ready for the screen", line: `${booking.business} | ${start}`, note: "Move it to Live on the start date", href: open(booking.reference) });
    else if (stage === "Live" && booking.request.endDate < today) list.push({ key: booking.reference, title: "Ready to finish", line: `${booking.business} | Ended ${dayDate(booking.request.endDate)}`, note: "Mark it finished", href: open(booking.reference) });
  }
  return list.slice(0, 2);
}

export default function PipelineBoard({ bookings, query, selected, status, today, hideFinished = false }: { bookings: PipelineCard[]; query: string; selected: string; status?: BookingStatus; today: string; hideFinished?: boolean }) {
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
  const card = (booking: PipelineCard, index: number) => {
    const task = nextTask(booking, today);
    const progress = booking.status === "Live" ? liveProgress(booking, today) : null;
    return <Link
      key={booking.reference} href={href(booking.reference)} scroll={false}
      className="pipeline-card" data-stage={booking.status} data-selected={selected === booking.reference}
      style={{ animationDelay: `${Math.min(index, 2) * 120}ms`, "--avatar": avatarColour(booking.business) } as CSSProperties}
      draggable={!["Finished", "Cancelled"].includes(booking.status)}
      onDragStart={(event) => { event.dataTransfer.setData("text/plain", booking.reference); event.dataTransfer.effectAllowed = "move"; setDragged(booking.reference); }}
      onDragEnd={() => { setDragged(""); setOver(null); }}
      aria-label={`${booking.business}, ${booking.status}, KES ${number(booking.priceKes)}, ${task.label}. Open booking`}
    >
      <span className="pipeline-card-head"><span className="business-avatar" aria-hidden="true">{booking.business.slice(0, 2).toUpperCase()}</span><strong>{booking.business}</strong><span className="pipeline-card-length">{booking.request.lengthSeconds}s</span></span>
      <span className="pipeline-card-price"><b>KES {number(booking.priceKes)}</b><small>{number(booking.plays)} plays</small></span>
      <span className="pipeline-card-dates"><span>{dateRange(booking.request.startDate, booking.request.endDate)}</span><small className="reference-link">{booking.reference}</small></span>
      {progress && <span className="pipeline-progress"><span className="pipeline-progress-line" aria-hidden="true"><i style={{ transform: `scaleX(${progress.ratio})` }} /></span><span className="pipeline-progress-text"><span>Day {progress.day} of {progress.total}</span><span>to {shortDate(booking.request.endDate)}</span></span></span>}
      <span className="pipeline-card-foot"><span className="pipeline-pill" data-tone={task.tone}>{task.label}</span><span className="v2-stage-track" aria-hidden="true">{STATUSES.filter((stage) => stage !== "Cancelled").map((stage, position) => <i key={stage} data-filled={position <= STATUSES.indexOf(booking.status)} />)}</span></span>
    </Link>;
  };
  const cancelled = bookings.filter((booking) => booking.status === "Cancelled");
  return <div className="pipeline-results" aria-busy={pending} data-pending={pending}>
    <div className="pipeline-scroll" role="region" aria-label="Booking pipeline. Scroll to see all stages." tabIndex={0}>
      <div className={"pipeline-board" + (status ? " is-filtered" : "")}>
        {STATUSES.filter((stage) => stage !== "Cancelled" && (!status || stage === status) && !(hideFinished && stage === "Finished")).map((stage) => {
          const items = bookings.filter((booking) => booking.status === stage);
          const helpers = items.length < 2 ? helpersFor(stage, items, today, (reference) => href(reference)) : [];
          return <section className="pipeline-column" key={stage} data-stage={stage} data-over={over === stage}
            aria-label={`${stage}, ${items.length} bookings`}
            onDragOver={(event) => { if (dragged) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(stage); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
            onDrop={(event) => { event.preventDefault(); const booking = bookings.find((item) => item.reference === dragged); setDragged(""); setOver(null); if (booking && booking.status !== stage) startTransition(() => router.push(href(booking.reference, stage), { scroll: false })); }}>
            <header><h2><i aria-hidden="true" />{stage}</h2><span className="pipeline-count">{items.length}</span></header>
            <p className="pipeline-column-total">KES {number(items.reduce((sum, booking) => sum + booking.priceKes, 0))}</p>
            <div className="pipeline-stack">{items.map(card)}
              {helpers.map((helper) => <Link key={helper.key} href={helper.href} scroll={false} className="pipeline-helper"><strong>{helper.title}</strong><span>{helper.line}</span><small>{helper.note}</small></Link>)}
              {!items.length && !helpers.length && stage !== "Quote" && <p className="pipeline-empty">No {stage.toLowerCase()} bookings</p>}
              {stage === "Quote" && <Link href="/book" className="pipeline-new-quote"><Plus size={12} aria-hidden="true" />New quote</Link>}
            </div>
          </section>;
        })}
      </div>
    </div>
    {!hideFinished && (!status || status === "Cancelled") && <section className="pipeline-cancelled" aria-label="Cancelled bookings"><h2>Cancelled <span className="pipeline-count">{cancelled.length}</span></h2><div className="pipeline-archive">{cancelled.map(card)}</div>{status === "Cancelled" && !cancelled.length && <p className="empty-state">No cancelled bookings match these filters.</p>}</section>}
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
      onCloseAutoFocus={(event) => { event.preventDefault(); [...document.querySelectorAll<HTMLAnchorElement>(".pipeline-card, .booking-list-link")].find((card) => new URL(card.href).searchParams.get("selected") === reference)?.focus(); }}>
      <Dialog.Title className="sr-only">{title}</Dialog.Title>
      <Dialog.Close className="quiet-button pipeline-inspector-close" aria-label="Close booking"><X size={18} aria-hidden="true" /></Dialog.Close>
      <div className="booking-detail-panel">{children}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
