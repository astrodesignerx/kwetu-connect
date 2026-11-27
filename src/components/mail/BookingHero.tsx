"use client";
import { useState } from "react";
import Image from "next/image";
import type { Booking, MailDirectory } from "@/lib/store/types";
import { advertState, bookingHref, managerAction, type Client } from "@/lib/mail/kca";
import { liveProgress } from "@/lib/booking/pipeline";
import { scheduleLines } from "@/lib/booking/selection";
import MailIcon from "./MailIcon";
import { bookingDates, number } from "./mail-format";

const STEPS = [["Quote", "Quote sent"], ["Paid", "Paid"], ["Approved", "Advert approved"], ["Live", "On air"], ["Finished", "Finished"]] as const;
const ADVERT: Record<ReturnType<typeof advertState>, string> = {
  approved: "Advert approved",
  waiting: "Advert waiting for review",
  refused: "Advert needs changes",
  none: "No advert yet",
};
const PICTURE = /\.(png|jpe?g|webp)$/i;

/** The booking a conversation is about: its advert on the screen, where and when it plays, and how far it has got. */
export default function BookingHero({ booking: b, client, data, today, onClient }: {
  booking: Booking; client: Client | null; data: MailDirectory; today: string; onClient?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const business = data.advertisers.find((a) => a.id === b.advertiserId)?.business || client?.advertiser.business || b.reference;
  const adverts = data.adverts.filter((a) => a.bookingId === b.id);
  const advert = adverts.find((a) => a.decision === "waiting") ?? adverts.at(-1);
  const picture = advert?.filePath && PICTURE.test(advert.fileName) ? `/manage/bookings/${encodeURIComponent(b.reference)}/advert/${encodeURIComponent(advert.id)}` : null;
  const state = advertState(data, b), action = managerAction(data, b);
  const at = STEPS.findIndex(([status]) => status === b.status), cancelled = b.status === "Cancelled";
  const run = b.status === "Live" ? liveProgress(b, today) : null;
  const hours = scheduleLines(b.request, data.settings.timeBlocks);
  const dates = bookingDates(b.request.startDate, b.request.endDate);
  const nextSub = b.status === "Quote"
    ? `${dates}, KES ${number(b.priceKes)}, ${number(b.plays)} plays`
    : state === "waiting"
      ? `${advert?.fileName || "Uploaded advert"}, ${ADVERT[state]}`
      : run
        ? `Day ${run.day} of ${run.total}, ${dates}`
        : `${dates}, ${ADVERT[state]}`;
  const nextCta = b.status === "Quote" ? "Confirm payment" : state === "waiting" ? "Review advert" : "Open booking";
  const copyRef = () => {
    void navigator.clipboard?.writeText(b.reference).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };
  return <div className="bk-block">
    <section className="bk-hero" aria-label={`Booking ${b.reference}`}>
      <div className="bk-scene">
        <div className="bk-bezel">
          <div className="bk-screen">
            {picture
              ? <Image src={picture} alt={`Advert for ${business}`} fill unoptimized sizes="420px" />
              : <div className="bk-slate"><b>{business}</b><small>{ADVERT[state]}</small></div>}
            {b.status === "Live" && <span className="bk-onair"><i />On air</span>}
          </div>
        </div>
        <div className="bk-ground">
          <div><b><MailIcon name="pin" size="xs" />Kisumu Ndogo Road</b><small>{hours.join(" / ") || "Hours to confirm"}</small></div>
          <div className="end"><b className="mono">{dates}</b><small>{number(b.request.lengthSeconds)} s, {number(b.request.howOften)} plays an hour</small></div>
        </div>
      </div>
      <div className="bk-facts">
        <div className="bk-ref-row">
          <a className="bk-ref mono" href={bookingHref(b)} title="Open the booking in the manager">{b.reference}<MailIcon name="ext" size="xs" /></a>
          <button type="button" className="bk-copy" onClick={copyRef} aria-label={copied ? "Reference copied" : "Copy booking reference"} title={copied ? "Copied" : "Copy reference"}>
            <MailIcon name={copied ? "check" : "copy"} size="xs" />
          </button>
        </div>
        <h3>{business}</h3>
        {client && (onClient
          ? <button type="button" className="bk-who" onClick={() => onClient(client.id)}>{client.advertiser.name}<MailIcon name="right" size="xs" /></button>
          : <span className="bk-who">{client.advertiser.name}</span>)}
        {client?.emails[0] && <span className="bk-email">{client.emails[0]}</span>}
        <p className="bk-money"><span>KES</span>{number(b.priceKes)}</p>
        {run && <div className="bk-run" aria-label={`Day ${run.day} of ${run.total}`}><span><i style={{ width: `${Math.round(run.ratio * 100)}%` }} /></span><small className="mono">Day {run.day} of {run.total}</small></div>}
        {cancelled
          ? <p className="bk-cancelled"><MailIcon name="x" size="xs" />Cancelled</p>
          : <ol className="bk-steps" aria-label="Booking progress">{STEPS.map(([status, label], i) => <li key={status} data-step={i < at ? "done" : i === at ? "now" : "next"} aria-current={i === at ? "step" : undefined}><i>{i < at && <MailIcon name="check" size="xs" />}</i>{label}</li>)}</ol>}
      </div>
    </section>
    <a className="bk-next" href={action.href}>
      <span className="bk-next-icon"><MailIcon name="bolt" size="sm" /></span>
      <span className="bk-next-text"><b>{action.label}</b><small>{nextSub}</small></span>
      <span className="bk-next-go">{nextCta}<MailIcon name="arrowRight" size="xs" /></span>
    </a>
  </div>;
}
