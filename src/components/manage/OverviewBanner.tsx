import Image from "next/image";
import Link from "next/link";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";

export default function OverviewBanner({ sold }: { sold: number }) {
  return <section className="v2-home-banner">
    <Image className="v2-photo-night" src="/images/evening-billboard.webp" alt="KCA screen on Kisumu Ndogo Road in Eldoret" fill priority sizes="(max-width: 767px) 100vw, 66vw" />
    <Image className="v2-photo-day" src="/images/daytime-billboard.webp" alt="" fill sizes="(max-width: 767px) 100vw, 66vw" />
    <div className="v2-banner-copy"><p className="v2-banner-eyebrow"><i />Kisumu Ndogo Rd, Eldoret</p><h1>Tonight is {Math.round(sold * 100)}% sold</h1><div><Link href="/manage/schedule" className="v2-glass-button"><CalendarBlank size={14} aria-hidden="true" />Open schedule</Link></div></div>
  </section>;
}
