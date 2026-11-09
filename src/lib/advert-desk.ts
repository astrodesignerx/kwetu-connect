// Pure helpers for the manager's Advert desk: queue groups, status pills and the check rows.
// Nothing here measures a file. Measured values come from the browser (see advert-checks.ts) and are passed in.
import { shortDate } from "./format/dates";
import type { CheckState } from "./advert-checks";
import type { Advert, BookingDetail } from "./store/types";

export type DeskEntry = { detail: BookingDetail; advert: Advert | null };
export type DeskFilter = "waiting" | "approved" | "refused" | "missing" | "all";
export type DeskGroup = { key: "review" | "missing" | "approved" | "refused"; title: string; items: DeskEntry[] };
export type PillTone = "amber" | "rose" | "green" | "quiet";

export const DESK_FILTERS: DeskFilter[] = ["waiting", "missing", "approved", "refused", "all"];
export const TAB_LABELS = { waiting: "Review", missing: "Missing", approved: "Approved", refused: "Refused" } as const;
const TITLES = { review: "To review", missing: "Missing a file", approved: "Approved recently", refused: "Refused" } as const;

const dayNumber = (date: string) => Math.round(Date.parse(date + "T00:00:00Z") / 86400000);

/** The Nairobi calendar day (YYYY-MM-DD) of a stored timestamp. */
export const nairobiDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

export const matchesFilter = (entry: DeskEntry, filter: DeskFilter) =>
  filter === "all" || (filter === "missing" ? !entry.advert : entry.advert?.decision === filter);

const byUpload = (a: DeskEntry, b: DeskEntry) => (a.advert?.createdAt ?? "").localeCompare(b.advert?.createdAt ?? "");

/** The grouped queue for a tab. Review shows three groups, every other tab only its own. */
export function groupQueue(entries: DeskEntry[], filter: DeskFilter): DeskGroup[] {
  const review = entries.filter((entry) => entry.advert?.decision === "waiting").sort(byUpload);
  const missing = entries.filter((entry) => !entry.advert).sort((a, b) => a.detail.booking.request.startDate.localeCompare(b.detail.booking.request.startDate));
  const approved = entries.filter((entry) => entry.advert?.decision === "approved").sort((a, b) => byUpload(b, a));
  const refused = entries.filter((entry) => entry.advert?.decision === "refused").sort((a, b) => byUpload(b, a));
  const groups: Omit<DeskGroup, "title">[] = filter === "waiting"
    ? [{ key: "review", items: review }, { key: "missing", items: missing }, { key: "approved", items: approved.slice(0, 5) }]
    : filter === "missing" ? [{ key: "missing", items: missing }]
    : filter === "approved" ? [{ key: "approved", items: approved }]
    : filter === "refused" ? [{ key: "refused", items: refused }]
    : [{ key: "review", items: review }, { key: "missing", items: missing }, { key: "approved", items: approved }, { key: "refused", items: refused }];
  return groups.filter((group) => group.items.length > 0).map((group) => ({ ...group, title: TITLES[group.key] }));
}

/** Status pill for a queue row. The approval time is not stored, so an approved pill carries no date. */
export function queuePill(entry: DeskEntry, today: string): { tone: PillTone; text: string } {
  const { advert, detail } = entry;
  if (!advert) {
    const status = detail.booking.status;
    if (status === "Quote") return { tone: "quiet", text: "Missing, unpaid" };
    if (status === "Live") return { tone: "rose", text: "Missing, live now" };
    return { tone: "rose", text: "Missing, starts " + shortDate(detail.booking.request.startDate) };
  }
  if (advert.decision === "approved") return { tone: "green", text: "Approved" };
  if (advert.decision === "refused") return { tone: "rose", text: "Refused" };
  const days = Math.max(0, dayNumber(today) - dayNumber(nairobiDay(advert.createdAt)));
  return { tone: "amber", text: days === 0 ? "Waiting today" : "Waiting " + days + (days === 1 ? " day" : " days") };
}

/** Second line of a queue row: the file name, or what is missing. */
export const queueSub = (entry: DeskEntry) => entry.advert ? entry.advert.fileName : "No file yet, " + (entry.detail.booking.status === "Quote" ? "quote" : "paid");

export type FileKind = "mp4" | "png" | "jpeg" | "other";
export function fileKind(fileName: string): FileKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext === "mp4" ? "mp4" : ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpeg" : "other";
}
export const kindLabel = (kind: FileKind) => kind === "mp4" ? "MP4 video" : kind === "png" ? "PNG still" : kind === "jpeg" ? "JPEG still" : "Unknown type";

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";

export type RowState = "pass" | "warn" | "fail" | "unknown" | "you";
export type CheckRow = { id: "size" | "length" | "type" | "light" | "road" | "rules"; label: string; state: RowState; detail: string };
type Part = { state: CheckState; detail: string };
const rowState = (state: CheckState): RowState => state === "pass" || state === "warn" || state === "fail" ? state : "unknown";

/** The six check rows. A row is only pass or fail when something was really measured or read from the file name. */
export function checkRows(input: { fileName: string; seconds: number; bookedSeconds: number; shape: Part | null; length: Part | null }): CheckRow[] {
  const { fileName, seconds, bookedSeconds, shape, length } = input;
  const kind = fileKind(fileName);
  const mismatch = seconds !== bookedSeconds;
  const lengthRow: CheckRow = mismatch
    ? { id: "length", label: "Length", state: "fail", detail: `Declared ${seconds} s, booked ${bookedSeconds} s.` }
    : length ? { id: "length", label: "Length", state: rowState(length.state), detail: length.detail }
    : { id: "length", label: "Length", state: "unknown", detail: `Declared ${seconds} s, matches the booking. Not measured until the file plays.` };
  return [
    shape ? { id: "size", label: "Size", state: rowState(shape.state), detail: shape.detail } : { id: "size", label: "Size", state: "unknown", detail: "Not measured until the file plays" },
    lengthRow,
    kind === "other"
      ? { id: "type", label: "File type", state: "fail", detail: "Use an MP4 video, or a PNG or JPEG still." }
      : { id: "type", label: "File type", state: "pass", detail: kindLabel(kind) + ", read from the file name. Codec not checked." },
    { id: "light", label: "Brightness at night", state: "unknown", detail: "Not measured. Judge it on the road view" },
    { id: "road", label: "Readable from the road", state: "you", detail: "Short headline, large type. Tick if you agree" },
    { id: "rules", label: "Meets KCA content rules", state: "you", detail: "No misleading claims, nothing offensive" },
  ];
}

/** "2 passed, 2 unknown, 2 for you". Ticked rows are counted apart because a tick is not a measurement. */
export function checkSummary(rows: CheckRow[], ticked: Record<string, boolean>) {
  const count = (test: (row: CheckRow) => boolean) => rows.filter(test).length;
  const parts = [
    [count((row) => row.state === "pass"), "passed"],
    [count((row) => row.state === "fail"), "failed"],
    [count((row) => row.state === "warn"), "to look at"],
    [count((row) => row.state === "unknown"), "unknown"],
    [count((row) => row.state === "you" && !ticked[row.id]), "for you"],
    [count((row) => row.state === "you" && Boolean(ticked[row.id])), "ticked by you"],
  ] as const;
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(", ");
}

type Point = [number, number];
/** CSS matrix3d that maps a w x h rectangle (origin at its top left) onto a four point quad: TL, TR, BR, BL. */
export function quadMatrix(w: number, h: number, quad: [Point, Point, Point, Point]) {
  const src: Point[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const rows: number[][] = [];
  src.forEach(([x, y], i) => {
    const [u, v] = quad[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  // Gaussian elimination on the 8 x 9 system.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = rows[r][col] / rows[col][col];
      for (let c = col; c < 9; c++) rows[r][c] -= factor * rows[col][c];
    }
  }
  const [a, b, c, d, e, f, g, i] = rows.map((row, index) => row[8] / row[index]);
  return { a, b, c, d, e, f, g, h: i, css: `matrix3d(${[a, d, 0, g, b, e, 0, i, 0, 0, 1, 0, c, f, 0, 1].map((n) => +n.toFixed(8)).join(",")})` };
}

/** Maps a point through the matrix, for tests. */
export function applyQuad(m: ReturnType<typeof quadMatrix>, x: number, y: number): Point {
  const k = m.g * x + m.h * y + 1;
  return [(m.a * x + m.b * y + m.c) / k, (m.d * x + m.e * y + m.f) / k];
}
