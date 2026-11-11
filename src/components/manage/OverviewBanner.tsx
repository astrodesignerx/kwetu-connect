import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";

/** The billboard photograph in the Overview's large panel, with tonight's planned evening share. The daytime photo shows in the light theme. */
export default function OverviewBanner({ sold }: { sold: number }) {
  return <div className="mg-photo-stage">
    <Image className="v2-photo-night" src="/images/evening-billboard.webp" alt="KCA screen on Kisumu Ndogo Road in Eldoret" fill priority sizes="(max-width: 679px) 100vw, (max-width: 899px) 60vw, 42vw" />
    <Image className="v2-photo-day" src="/images/daytime-billboard.webp" alt="" fill sizes="(max-width: 679px) 100vw, (max-width: 899px) 60vw, 42vw" />
    <div className="mg-photo-copy">
      <span className="mg-eyebrow">Kisumu Ndogo Rd, Eldoret</span>
      <strong>Tonight is <span className="mg-nowrap">{Math.round(sold * 100)}% sold</span></strong>
      <Link href="/manage/schedule" className="mg-pill">Open schedule<ArrowUpRight size={12} aria-hidden="true" /></Link>
    </div>
  </div>;
}
