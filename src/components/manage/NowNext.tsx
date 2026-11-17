import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";

export type NowNextRow = { id: string; name: string; tag: "playing" | "next" | "first"; length: number; plays: number | null };

const LABELS: Record<NowNextRow["tag"], string> = { playing: "Scheduled now", next: "Up next", first: "First after opening" };

/** The planned playlist beside the billboard photo: what is scheduled now and what follows, or the first two adverts after opening. */
export default function NowNext({ rows, time, empty = "Nothing is scheduled in this hour." }: { rows: NowNextRow[]; time: string; empty?: string }) {
  return <section className="mg-playlist" aria-label="Planned playlist">
    <span className="mg-eyebrow">Now and next / {time}</span>
    <h3>Planned playlist</h3>
    {rows.length ? <ul className="mg-playlist-items">{rows.map((row) => <li key={row.id + row.tag} data-tag={row.tag}>
      <span className={row.tag === "playing" ? "mg-status" : "mg-eyebrow"}>{LABELS[row.tag]}</span>
      <b>{row.name}</b>
      <small>{row.plays === null ? `${row.length}s` : `${row.length}s / ${row.plays} an hour`}</small>
    </li>)}</ul> : <p className="mg-playlist-empty">{empty}</p>}
    <Link href="/manage/schedule" className="mg-pill">Open playlist<ArrowUpRight size={12} aria-hidden="true" /></Link>
  </section>;
}
