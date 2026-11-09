"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Question, WarningCircle, X } from "@phosphor-icons/react";
import { decideAdvert } from "@/app/manage/actions";
import { checkShape, checkLength } from "@/lib/advert-checks";
import { checkRows, checkSummary, fileKind, kindLabel, type RowState } from "@/lib/advert-desk";
import AdvertBookingCard, { type BookingFacts } from "./AdvertBookingCard";
import AdvertCardHead from "./AdvertCardHead";
import AdvertStage, { type Measurement } from "./AdvertStage";
import type { Advert } from "@/lib/store/types";

const STATE_WORDS: Record<RowState, string> = { pass: "Passed", fail: "Failed", warn: "Look at this", unknown: "Unknown", you: "For you" };
function Medal({ state, ticked }: { state: RowState; ticked?: boolean }) {
  return <span className="advert-medal" data-state={state} data-ticked={ticked || undefined} aria-hidden="true">
    {state === "pass" ? <Check size={14} weight="bold" /> : state === "fail" ? <X size={14} weight="bold" /> : state === "warn" ? <WarningCircle size={14} weight="bold" /> : state === "unknown" ? <Question size={14} weight="bold" /> : <Check size={14} weight="bold" />}
  </span>;
}

export default function AdvertReview({ advert, reference, business, bookedSeconds, demo, uploaded, facts, paidWithApproved }: { advert: Advert; reference: string; business: string; bookedSeconds: number; demo: boolean; uploaded: string; facts: BookingFacts; paidWithApproved: boolean }) {
  const [measured, setMeasured] = useState<Measurement | null>(null);
  const [failed, setFailed] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [state, action, pending] = useActionState(decideAdvert, { message: "" });
  const url = advert.filePath ? `/manage/bookings/${reference}/advert/${advert.id}` : null;
  const kind = fileKind(advert.fileName);
  const video = kind === "mp4";
  const shape = measured ? checkShape(measured.width, measured.height) : null;
  const length = measured ? checkLength(video ? "video" : "image", measured.duration, bookedSeconds) : null;
  const blocked = shape?.state === "fail" || length?.state === "fail" || advert.seconds !== bookedSeconds;
  const rows = checkRows({ fileName: advert.fileName, seconds: advert.seconds, bookedSeconds, shape, length });
  return <>
    <section className="v2-card advert-card advert-preview-card" aria-label="Preview">
      <AdvertCardHead business={business} reference={reference} downloadUrl={url} fileName={advert.fileName}
        facts={[advert.fileName, advert.seconds + " s", kindLabel(kind), "uploaded " + uploaded].join(" | ")} />
      <AdvertStage url={failed ? null : url} video={video} fileName={advert.fileName} onMeasured={setMeasured} onFailed={() => setFailed(true)}
        unavailable={<div className="advert-unavailable"><strong>{demo ? "Demo advert" : "Preview unavailable"}</strong><span>{advert.fileName}</span><small>{demo ? "Demo mode stores file names only. No media is available." : "The file could not be shown here. Nothing is measured for it."}</small></div>} />
    </section>
    <section className="v2-card advert-card advert-checks-card" aria-label="Checks">
      <div className="advert-checks-head"><h2>Checks</h2><span>{checkSummary(rows, ticked)}</span></div>
      <ul className="advert-checks">{rows.map((row) => row.state === "you"
        ? <li key={row.id}><label className="advert-check" data-state="you"><input type="checkbox" checked={Boolean(ticked[row.id])} onChange={(event) => setTicked({ ...ticked, [row.id]: event.target.checked })} /><Medal state="you" ticked={ticked[row.id]} /><span className="advert-check-text"><b>{row.label}</b><small>{row.detail}</small></span></label></li>
        : <li key={row.id} className="advert-check" data-state={row.state}><Medal state={row.state} /><span className="advert-check-text"><b>{row.label}<span className="sr-only">: {STATE_WORDS[row.state]}</span></b><small>{row.detail}</small></span></li>)}</ul>
      <AdvertBookingCard facts={facts} />
      {advert.decision !== "waiting" && <p className="advert-current">Saved decision: <b>{advert.decision === "approved" ? "Approved" : "Refused"}</b>{advert.reason && <span>{advert.reason}</span>}</p>}
      <form action={action} className="advert-decision"><fieldset disabled={pending}>
        <input type="hidden" name="reference" value={reference} /><input type="hidden" name="id" value={advert.id} /><input type="hidden" name="decision" value={refusing ? "refused" : "approved"} />
        <div className="advert-segment" role="group" aria-label="Choose decision" data-choice={refusing ? "refuse" : "approve"}><i aria-hidden="true" /><button type="button" aria-pressed={!refusing} onClick={() => setRefusing(false)}><Check size={13} aria-hidden="true" />Approve</button><button type="button" aria-pressed={refusing} onClick={() => setRefusing(true)}><X size={13} aria-hidden="true" />Refuse</button></div>
        {refusing && <label className="advert-reason">Reason for refusing<textarea name="reason" required maxLength={500} defaultValue={advert.reason} rows={3} /></label>}
        {!refusing && blocked && <p role="alert" className="advert-alert">Fix the shape or length mismatch before approving this advert.</p>}
        <button type="submit" className="advert-submit" data-refuse={refusing || undefined} disabled={!refusing && blocked}>{pending ? "Saving..." : refusing ? "Save refusal" : "Approve advert"}</button>
      </fieldset><p role="status" className="advert-status">{state.message}</p></form>
      <p className="advert-help">Your decision is saved on the booking. No email is sent from here. Approving a file does not move the booking.</p>
      {paidWithApproved && <Link className="advert-open advert-open-booking" href={"/manage/bookings?selected=" + reference}>Open booking to approve it</Link>}
    </section>
  </>;
}
