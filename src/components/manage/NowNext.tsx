export type NowNextRow = { id: string; name: string; tag: "playing" | "next" | "first"; length: number; plays: number | null };

/** Two lines under the Overview hour bars: what is on the screen and what follows, or the first two adverts after opening. */
export default function NowNext({ rows, empty = "Nothing is scheduled in this hour." }: { rows: NowNextRow[]; empty?: string }) {
  if (!rows.length) return <p className="v2-now-next-empty">{empty}</p>;
  return <ul className="v2-now-next" aria-label="On the screen">{rows.map((row) => <li key={row.id + row.tag} data-tag={row.tag}>
    <i aria-hidden="true" /><span><b>{row.name}</b> {row.tag}</span>
    <small>{row.plays === null ? `${row.length}s` : `${row.length}s, ${row.plays} an hour`}</small>
  </li>)}</ul>;
}
