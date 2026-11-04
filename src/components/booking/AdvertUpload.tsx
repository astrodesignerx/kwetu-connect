"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { CheckCircle, UploadSimple, WarningCircle, XCircle } from "@phosphor-icons/react";
import { CHECK_LABELS, CHECK_ORDER, measure, runCheck, type CheckId, type CheckResult, type Measured } from "@/lib/advert-checks";
import { Button } from "@/components/ui/button";

export type AdvertState = { file: File; url: string; measured: Measured | null; done: CheckId[]; running: boolean };

/** Every check's result for the current advert length. Checks not yet run are pending or running. */
export function advertResults(advert: AdvertState, lengthSeconds: number): CheckResult[] {
  const next = CHECK_ORDER.find((id) => !advert.done.includes(id));
  return CHECK_ORDER.map((id) => advert.done.includes(id) ? runCheck(id, advert.file, advert.measured, lengthSeconds)
    : { id, label: CHECK_LABELS[id], state: advert.running && id === next ? "running" : "pending", detail: "" });
}
/** Ready to save with the booking: every check has run and none failed. */
export function advertReady(advert: AdvertState | null, lengthSeconds: number) {
  return !!advert && !advert.running && advert.done.length === CHECK_ORDER.length && advertResults(advert, lengthSeconds).every((r) => r.state !== "fail");
}

const STEP_MS = 420;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function CheckIcon({ state }: { state: CheckResult["state"] }) {
  if (state === "pass") return <CheckCircle weight="fill" className="check-icon is-pass" aria-hidden="true" />;
  if (state === "warn") return <WarningCircle weight="fill" className="check-icon is-warn" aria-hidden="true" />;
  if (state === "fail") return <XCircle weight="fill" className="check-icon is-fail" aria-hidden="true" />;
  return <span className={`check-icon is-${state}`} aria-hidden="true" />;
}

export default function AdvertUpload({ lengthSeconds, advert, onChange }: { lengthSeconds: number; advert: AdvertState | null; onChange: (advert: AdvertState | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const [dragging, setDragging] = useState(false);
  const latest = useRef(advert);
  useEffect(() => { latest.current = advert; }, [advert]);
  useEffect(() => () => { run.current += 1; if (latest.current) URL.revokeObjectURL(latest.current.url); }, []);

  async function check(file: File) {
    const id = ++run.current;
    if (advert) URL.revokeObjectURL(advert.url);
    const url = URL.createObjectURL(file);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let state: AdvertState = { file, url, measured: null, done: [], running: true };
    onChange(state);
    const fileOk = runCheck("file", file, null, lengthSeconds).state !== "fail";
    const measuring = fileOk ? measure(file, url) : Promise.resolve(null);
    for (const step of CHECK_ORDER) {
      await wait(reduced ? 0 : STEP_MS);
      if (step === "shape") state = { ...state, measured: await measuring };
      if (run.current !== id) return;
      state = { ...state, done: [...state.done, step] };
      const failed = runCheck(step, file, state.measured, lengthSeconds).state === "fail";
      // A file that cannot be opened stops here; the rest stay pending.
      if (failed && (step === "file" || !state.measured)) { state = { ...state, running: false }; onChange(state); return; }
      onChange({ ...state, running: step !== CHECK_ORDER[CHECK_ORDER.length - 1] });
    }
    if (run.current === id) onChange({ ...state, running: false });
  }
  function pick(files: FileList | null) { const file = files?.[0]; if (file) void check(file); }
  function remove() { run.current += 1; if (advert) URL.revokeObjectURL(advert.url); onChange(null); if (input.current) input.current.value = ""; }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }

  const results = advert ? advertResults(advert, lengthSeconds) : [];
  const fails = results.filter((r) => r.state === "fail").length;
  const warns = results.filter((r) => r.state === "warn").length;
  const finished = !!advert && !advert.running;
  const headline = !advert ? "" : advert.running ? "Checking your advert" : fails ? `Fix ${fails === 1 ? "1 problem" : fails + " problems"} before it can go with your booking`
    : warns ? `Ready, with ${warns === 1 ? "1 note" : warns + " notes"} to look at` : "Ready for the screen";
  const fileInput = <input ref={input} type="file" accept="video/mp4,image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files)} />;

  if (!advert) return <section className={`screen-preview advert-drop${dragging ? " is-dragging" : ""}`} aria-label="Your advert"
    onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
    <Image src="/images/evening-billboard.webp" alt="" fill sizes="(max-width: 767px) 100vw, 38vw" priority />
    <span className="photo-pill">Kisumu Ndogo Road, Eldoret</span>
    <div className="advert-drop-card">
      <span className="advert-drop-icon" aria-hidden="true"><UploadSimple weight="bold" /></span>
      <div><strong>Add your advert</strong><p>Drop an MP4, PNG or JPEG here. We check it against the screen in seconds.</p><small>16:9, up to 50 MB. You can also send it later on WhatsApp.</small></div>
      <Button type="button" onClick={() => input.current?.click()}>Choose file</Button>
    </div>
    {fileInput}
  </section>;

  return <section className="screen-preview advert-checking" aria-label="Your advert" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
    <div className="advert-screen">
      {advert.file.type.startsWith("video/") ? <video key={advert.url} src={advert.url} muted loop autoPlay playsInline aria-label="Your advert preview" />
        // eslint-disable-next-line @next/next/no-img-element
        : advert.file.type.startsWith("image/") ? <img src={advert.url} alt="Your advert preview" /> : null}
      <span className="photo-pill">Screen 768 x 432</span>
    </div>
    <div className="advert-report">
      <div className="advert-report-head"><small title={advert.file.name}>{advert.file.name}</small><strong key={headline} aria-live="polite">{headline}</strong></div>
      <ol className="check-list">{results.map((r) => <li key={r.id} data-state={r.state}>
        <CheckIcon state={r.state} /><div><span>{r.label}</span>{r.detail && <small>{r.detail}</small>}</div>
      </li>)}</ol>
      <div className="advert-report-actions">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>{finished && fails ? "Choose another file" : "Replace"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={remove}>Remove</Button>
      </div>
    </div>
    {fileInput}
  </section>;
}
