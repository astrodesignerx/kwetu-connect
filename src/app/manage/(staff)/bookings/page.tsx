import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { STATUSES } from "@/lib/booking/status";
import BookingFilters from "@/components/manage/BookingFilters";
import BookingDetail from "@/components/manage/BookingDetail";
import BookingList from "@/components/manage/BookingList";
import PipelineBoard, { PipelineInspector } from "@/components/manage/PipelineBoard";
import PipelineMove from "@/components/manage/PipelineMove";
import { todayInNairobi } from "@/lib/store/validation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { number } from "@/components/booking/QuoteTotals";
import { StageShareBar } from "@/components/manage/V2Visuals";
import { RevenueChart } from "@/components/workspace/Charts";
import { weeklyTotals } from "@/lib/dashboard";
import { endsThisMonth, loadCards, matchesBase, mondayOf, needsAction, parseFilters, startsThisWeek, visibleBookings } from "@/lib/booking/pipeline";
import { DownloadSimple, Kanban, ListBullets } from "@phosphor-icons/react/dist/ssr";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const params = await searchParams;
  const read = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  if (read("adverts") === "1") redirect("/manage/adverts" + (read("q") ? "?q=" + encodeURIComponent(read("q")) : ""));
  const filter = parseFilters(read);
  const store = getStore();
  const today = todayInNairobi();
  const [all, settings] = await Promise.all([loadCards(store), store.getSettings()]);
  const base = all.filter((booking) => matchesBase(booking, filter));
  const counts = { all: base.length, needs: base.filter(needsAction).length, week: base.filter((booking) => startsThisWeek(booking, today)).length, ending: base.filter((booking) => endsThisMonth(booking, today)).length };
  const bookings = visibleBookings(all, filter, today);
  const stageCounts = visibleBookings(all, { ...filter, hide: false }, today);
  const selected = read("selected");
  const detail = selected && all.some((booking) => booking.reference === selected) ? await store.bookingDetail(selected) : null;
  const values = new URLSearchParams();
  for (const key of ["status", "from", "to", "q", "view", "hide", "layout"]) if (read(key)) values.set(key, read(key));
  const target = STATUSES.find((stage) => stage === read("moveTo"));
  const monday = mondayOf(today);
  const withLayout = (layout: string) => { const next = new URLSearchParams(values); if (layout === "list") next.set("layout", "list"); else next.delete("layout"); const text = next.toString(); return "/manage/bookings" + (text ? "?" + text : ""); };
  const exportQuery = new URLSearchParams(values);
  exportQuery.delete("layout");
  const moveQuery = new URLSearchParams(values);
  moveQuery.set("selected", selected);
  return <section className="pipeline-page">
    <div className="pipeline-heading">
      <p className="pipeline-help">{bookings.length} booking{bookings.length === 1 ? "" : "s"} | Drag a card to change its stage, you confirm every move</p>
      <div className="pipeline-actions v2-heading-tools">
        <nav className="v2-segmented" aria-label="Layout"><Link href={withLayout("board")} scroll={false} aria-current={filter.layout === "board" ? "page" : undefined}><Kanban size={14} aria-hidden="true" />Board</Link><Link href={withLayout("list")} scroll={false} aria-current={filter.layout === "list" ? "page" : undefined}><ListBullets size={14} aria-hidden="true" />List</Link></nav>
        <a className="quiet-button v2-export" href={"/manage/bookings/export" + (exportQuery.toString() ? "?" + exportQuery : "")}><DownloadSimple size={14} aria-hidden="true" />Export CSV</a>
      </div>
    </div>
    <BookingFilters filter={filter} counts={counts} today={today}>
      <div className="v2-bookings-summary"><StageShareBar stages={STATUSES.filter((status) => status !== "Cancelled").map((label) => ({ label, count: stageCounts.filter((booking) => booking.status === label).length }))} /><section className="v2-card v2-booked-value"><h2>Booked value</h2><strong>KES {number(all.filter((booking) => booking.status !== "Cancelled").reduce((total, booking) => total + booking.priceKes, 0))}</strong><RevenueChart weeks={weeklyTotals(all, monday)} /></section></div>
      {filter.from && filter.to && filter.from > filter.to && <p role="alert">The end date is before the start date.</p>}
      {filter.layout === "list"
        ? <BookingList bookings={bookings} query={values.toString()} selected={selected} today={today} />
        : <PipelineBoard bookings={bookings} query={values.toString()} selected={selected} status={filter.status} today={today} hideFinished={filter.hide} />}
      {!bookings.length && <div className="ns-card empty-state">No bookings match these filters.</div>}
    </BookingFilters>
    {detail && <PipelineInspector key={detail.booking.reference} title={detail.advertiser.business} closeUrl={"/manage/bookings?" + values} reference={detail.booking.reference}>
      <BookingDetail detail={detail} settings={settings} demo={store.mode === "memory"} today={today} moveBase={"/manage/bookings?" + moveQuery} compact
        confirm={target ? <PipelineMove key={detail.booking.reference + target} detail={detail} target={target} settings={settings} today={today} /> : undefined} />
    </PipelineInspector>}
  </section>;
}
