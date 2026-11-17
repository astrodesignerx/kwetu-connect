import Link from "next/link";
import { ArrowUpRight, Clock, Play, Warning } from "@phosphor-icons/react/dist/ssr";
import { dueLabel, shortDate } from "@/lib/format/dates";

export type Task = { key: string; kind: "review" | "chase" | "confirm" | "nudge"; title: string; detail: string; action: string; href: string; start: string };
type Soon = { reference: string; business: string; status: string; startDate: string };

/** "Needs you": the first four tasks, a link to all bookings, and the bookings starting in the next 14 days. */
export default function NeedsYou({ tasks, soon, today }: { tasks: Task[]; soon: Soon[]; today: string }) {
  return <section className="mg-panel mg-needs" id="needs-you">
    <div className="mg-needs-heading">
      <div><span className="mg-eyebrow">Your next actions</span><h2>Needs you <span className="mg-count">{tasks.length}</span></h2></div>
      <Link href="/manage/bookings" className="mg-pill">See all{tasks.length > 4 && <span className="mg-badge">{tasks.length}</span>}<ArrowUpRight size={11} aria-hidden="true" /></Link>
    </div>
    <div className="mg-tasks">
      {tasks.slice(0, 4).map((task) => <Link key={task.key} className="mg-task" data-task={task.kind} href={task.href}>
        <span className="mg-task-icon" aria-hidden="true">{task.kind === "review" ? <Play size={12} weight="fill" /> : task.kind === "chase" ? <Warning size={12} weight="fill" /> : task.kind === "nudge" ? <Clock size={12} weight="fill" /> : "KES"}</span>
        <span className="mg-task-text"><b>{task.title}</b><small>{task.detail}</small></span>
        <span className="mg-task-end"><span className="mg-task-action">{task.action}</span><small>{dueLabel(task.start, today)}</small></span>
      </Link>)}
      {!tasks.length && <p className="mg-empty">All caught up. No bookings need action.</p>}
    </div>
    <details className="mg-starting">
      <summary>Starting soon ({soon.length})</summary>
      <div className="mg-starting-list">
        {soon.map((booking) => <Link key={booking.reference} href={"/manage/bookings?selected=" + booking.reference}><span>{booking.business}</span><small>{shortDate(booking.startDate)} / {booking.status}</small></Link>)}
        {!soon.length && <p>No bookings start in the next 14 days.</p>}
      </div>
    </details>
  </section>;
}
