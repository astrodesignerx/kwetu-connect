import Link from "next/link";
import Image from "next/image";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { fileKind, queuePill, queueSub, TAB_LABELS, type DeskEntry, type DeskFilter, type DeskGroup } from "@/lib/advert-desk";

function Thumb({ entry }: { entry: DeskEntry }) {
  const { advert, detail } = entry;
  if (!advert) return <span className="advert-thumb" data-kind="missing"><UploadSimple size={14} aria-hidden="true" /></span>;
  const url = advert.filePath ? `/manage/bookings/${detail.booking.reference}/advert/${advert.id}` : null;
  if (!url) return <span className="advert-thumb" data-kind="tile">{advert.seconds}s</span>;
  return <span className="advert-thumb" data-kind="media">{fileKind(advert.fileName) === "mp4" ? <video muted playsInline preload="metadata" src={url + "#t=0.1"} tabIndex={-1} aria-hidden="true" /> : <Image src={url} alt="" fill unoptimized sizes="64px" />}</span>;
}

export default function AdvertQueue({ groups, counts, filter, selectedKey, today, href }: { groups: DeskGroup[]; counts: Record<keyof typeof TAB_LABELS, number>; filter: DeskFilter; selectedKey: string; today: string; href: (filter: DeskFilter, reference?: string, id?: string) => string }) {
  return <section className="v2-card advert-card advert-queue" aria-label="Advert queue">
    <nav className="advert-tabs" aria-label="Queue tabs">{(Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[]).map((tab) => <Link key={tab} href={href(tab)} aria-current={filter === tab ? "page" : undefined}>{TAB_LABELS[tab]}<span>{counts[tab]}</span></Link>)}</nav>
    <div className="advert-queue-list">
      {groups.length === 0 && <p className="advert-queue-empty">Nothing in this queue.</p>}
      {groups.map((group) => <div key={group.key} role="group" aria-label={group.title} className="advert-group"><h3>{group.title}</h3>
        {group.items.map((entry) => {
          const { advert, detail } = entry;
          const pill = queuePill(entry, today);
          const key = detail.booking.reference + "/" + (advert?.id ?? "");
          return <Link key={key} className="advert-row" href={href(filter, detail.booking.reference, advert?.id)} aria-current={key === selectedKey ? "true" : undefined}>
            <Thumb entry={entry} /><span className="advert-row-text"><strong>{detail.advertiser.business}</strong><small>{queueSub(entry)}</small><span className="pipeline-pill" data-tone={pill.tone === "quiet" ? undefined : pill.tone}>{pill.text}</span></span>
          </Link>;
        })}
      </div>)}
    </div>
  </section>;
}
