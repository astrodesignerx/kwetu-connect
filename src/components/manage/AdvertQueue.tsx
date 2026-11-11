import Link from "next/link";
import Image from "next/image";
import { Check, Play, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import AdvertRail from "@/components/manage/AdvertRail";
import AdvertQueueTabs from "@/components/manage/AdvertQueueTabs";
import { fileKind, groupQueue, queuePill, queueSub, TAB_LABELS, type DeskEntry, type DeskFilter, type PillTone } from "@/lib/advert-desk";

function Thumb({ entry, pill }: { entry: DeskEntry; pill: { tone: PillTone; text: string } }) {
  const { advert, detail } = entry;
  const badge = advert?.decision === "approved"
    ? <span className="advert-tick" role="img" aria-label="Approved"><Check size={12} weight="bold" aria-hidden="true" /></span>
    : <span className="pipeline-pill" data-tone={pill.tone === "quiet" ? undefined : pill.tone}>{pill.text}</span>;
  if (!advert) return <span className="advert-thumb" data-kind="missing"><UploadSimple size={18} aria-hidden="true" /><span className="advert-add">Add advert</span>{badge}</span>;
  const url = advert.filePath ? `/manage/bookings/${detail.booking.reference}/advert/${advert.id}` : null;
  const video = fileKind(advert.fileName) === "mp4";
  return <span className="advert-thumb" data-kind={url ? "media" : "tile"}>
    {!url ? <span className="advert-thumb-name">{detail.advertiser.business}</span> : video ? <video muted playsInline preload="metadata" src={url + "#t=0.1"} tabIndex={-1} aria-hidden="true" /> : <Image src={url} alt="" fill unoptimized sizes="190px" />}
    {url && video && <span className="advert-play" aria-hidden="true"><Play size={14} weight="fill" /></span>}
    <span className="advert-length">{advert.seconds}s</span>{badge}
  </span>;
}

export default function AdvertQueue({ entries, counts, filter, selectedKey, today, href }: { entries: DeskEntry[]; counts: Record<keyof typeof TAB_LABELS, number>; filter: DeskFilter; selectedKey: string; today: string; href: (filter: DeskFilter, reference?: string, id?: string) => string }) {
  const ids = Object.keys(TAB_LABELS) as (keyof typeof TAB_LABELS)[];
  const tabs = ids.map((id) => ({ id, label: TAB_LABELS[id], count: counts[id], attention: counts[id] > 0 && (id === "waiting" || id === "missing") }));
  const panel = (tab: DeskFilter) => {
    const groups = groupQueue(entries, tab);
    return <AdvertRail>
      {groups.length === 0 && <>
        <p className="advert-queue-empty">Nothing in this queue.</p>
        {/* An invisible tile holds the strip at the same height as a full queue. */}
        <div className="advert-group advert-group-ghost" aria-hidden="true"><h3>&nbsp;</h3><span className="advert-row"><span className="advert-thumb" data-kind="missing" /><span className="advert-row-text"><strong>&nbsp;</strong><small>&nbsp;</small></span></span></div>
      </>}
      {groups.map((group) => <div key={group.key} role="group" aria-label={group.title} className="advert-group"><h3>{group.title}<span>{group.items.length}</span></h3>
        {group.items.map((entry) => {
          const { advert, detail } = entry;
          const pill = queuePill(entry, today);
          const state = !advert ? (pill.tone === "rose" ? "missing-urgent" : "missing") : advert.decision === "waiting" ? "review" : advert.decision;
          const key = detail.booking.reference + "/" + (advert?.id ?? "");
          return <Link key={key} className="advert-row" href={href(tab, detail.booking.reference, advert?.id)} data-state={state} aria-current={key === selectedKey ? "true" : undefined}>
            <Thumb entry={entry} pill={pill} /><span className="advert-row-text"><strong>{detail.advertiser.business}</strong><small>{queueSub(entry)}</small></span>
          </Link>;
        })}
      </div>)}
    </AdvertRail>;
  };
  const shown: DeskFilter[] = filter === "all" ? [...ids, "all"] : ids;
  return <section className="v2-card advert-card advert-queue" aria-label="Advert queue">
    <AdvertQueueTabs tabs={tabs} filter={filter} panels={Object.fromEntries(shown.map((tab) => [tab, panel(tab)]))} />
  </section>;
}
