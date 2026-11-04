import Image from "next/image";
import type { Answers } from "@/lib/booking/answers";
import type { BookingSettings } from "@/lib/booking/settings";
import { number } from "./QuoteTotals";
export default function ScreenPreview({ answers, settings, plays }: { answers: Answers; settings: BookingSettings; plays: number }) {
  const days = answers.days.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ");
  const blocks = answers.blocks.map((block) => settings.timeBlocks[block].label.toLowerCase()).join(" and ");
  return <section className="screen-preview"><Image src="/images/evening-billboard.webp" alt="KCA LED screen on Kisumu Ndogo Road, Eldoret" fill sizes="(max-width: 767px) 100vw, 38vw" priority /><span className="photo-pill">Kisumu Ndogo Road, Eldoret</span><div className="preview-caption"><div><small>Your advert would show</small><strong>{answers.lengthSeconds}s, {answers.howOften} plays an hour<br />{days || "Choose days"} / {blocks || "choose hours"}</strong></div><span key={plays} className="preview-plays rolling-number">{number(plays)}<small>plays</small></span></div></section>;
}
