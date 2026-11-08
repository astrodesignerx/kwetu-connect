"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { decideAdvert } from "@/app/manage/actions";
import { checkShape, checkLength } from "@/lib/advert-checks";
import type { Advert } from "@/lib/store/types";

type Measurement = { width: number; height: number; duration: number | null };

export default function AdvertReview({ advert, reference, bookedSeconds, demo }: { advert: Advert; reference: string; bookedSeconds: number; demo: boolean }) {
  const [measured, setMeasured] = useState<Measurement | null>(null);
  const [failed, setFailed] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [state, action, pending] = useActionState(decideAdvert, { message: "" });
  const url = advert.filePath ? `/manage/bookings/${reference}/advert/${advert.id}` : null;
  const video = advert.fileName.toLowerCase().endsWith(".mp4");
  const shape = measured ? checkShape(measured.width, measured.height) : null;
  const length = measured ? checkLength(video ? "video" : "image", measured.duration, bookedSeconds) : null;
  const blocked = shape?.state === "fail" || length?.state === "fail" || advert.seconds !== bookedSeconds;
  return <div className="advert-review-layout">
    <section className="advert-review-preview"><div className="review-screen">
      {url && !failed ? video ? <video controls preload="metadata" src={url} onLoadedMetadata={(event) => { const media = event.currentTarget; setMeasured({ width: media.videoWidth, height: media.videoHeight, duration: media.duration }); }} onError={() => setFailed(true)} aria-label={advert.fileName} /> : <Image fill unoptimized sizes="(max-width: 767px) 100vw, 800px" src={url} alt={advert.fileName} onLoad={(event) => { const media = event.currentTarget; setMeasured({ width: media.naturalWidth, height: media.naturalHeight, duration: null }); }} onError={() => setFailed(true)} /> : <div className="review-unavailable"><strong>{demo ? "Demo advert" : "Preview unavailable"}</strong><span>{advert.fileName}</span><small>{demo ? "Demo mode stores file names only. No media measurements are available." : "Open the file to inspect it. No media measurements are available."}</small></div>}
    </div><div className="review-file-caption"><strong>{advert.fileName}</strong><span>{video ? "MP4 video" : "Still image"} / {advert.seconds}s declared / {bookedSeconds}s booked</span></div>{url && <a href={url} target="_blank" rel="noopener noreferrer" className="quiet-button">Open original file</a>}</section>
    <section className="ns-card review-checks"><h2>Review checks</h2>
      <dl><div><dt>Shape and resolution</dt><dd data-state={shape?.state ?? "pending"}>{shape?.detail ?? "Not measured. Open a playable file to check its dimensions."}</dd></div>
        <div><dt>Length</dt><dd data-state={length?.state ?? (advert.seconds !== bookedSeconds ? "fail" : "pending")}>{length?.detail ?? `Declared ${advert.seconds}s / booked ${bookedSeconds}s. Media duration not measured.`}</dd></div>
        <div><dt>File size</dt><dd>Uploads are limited to 50 MB. Saved file size is not recorded.</dd></div>
        <div><dt>Readability and sound</dt><dd>Check text at a distance and make sure the message works without sound.</dd></div>
      </dl>
      <p className="review-current">Decision: <strong>{advert.decision}</strong>{advert.reason && <span>{advert.reason}</span>}</p>
      <form action={action} className="staff-form review-decision"><fieldset disabled={pending}>
        <input type="hidden" name="reference" value={reference} /><input type="hidden" name="id" value={advert.id} /><input type="hidden" name="decision" value={refusing ? "refused" : "approved"} />
        <div className="review-decision-options" aria-label="Choose decision"><button type="button" aria-pressed={!refusing} onClick={() => setRefusing(false)}>Approve</button><button type="button" aria-pressed={refusing} onClick={() => setRefusing(true)}>Refuse with reason</button></div>
        {refusing && <label className="review-reason">Reason for refusing<textarea name="reason" required maxLength={500} defaultValue={advert.reason} rows={3} /></label>}
        {!refusing && blocked && <p role="alert">Fix the shape or length mismatch before approving this advert.</p>}
        <button type="submit" className="staff-button" disabled={!refusing && blocked}>{pending ? "Saving..." : refusing ? "Save refusal" : "Approve advert"}</button>
      </fieldset><p role="status">{state.message}</p></form>
      <p className="pipeline-help">Approving a file keeps the booking at its current stage. Move a Paid booking to Approved once it is ready.</p>
    </section>
  </div>;
}
