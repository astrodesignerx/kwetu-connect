import type { ReactNode } from "react";
import MailIcon, { KcaMark, type MailIconName } from "./MailIcon";

/** Decoration only: sample conversations drifting past behind the brand copy. Hidden from assistive technology. */
const STREAM: [string, string, string, string, boolean?][] = [
  ["Eldoret Bakery", "EB", "#FBB040", "Booked", true], ["Safari Cola", "SC", "#7dd3fc", "Quote sent"], ["Mama Mboga Co.", "MM", "#86efac", "Artwork in"],
  ["Nyali Motors", "NM", "#fca5a5", "Invoice paid"], ["Kilimo Seeds", "KS", "#c4b5fd", "Reply due"], ["Tuko Telecom", "TT", "#FBB040", "Booked", true],
  ["Pwani Water", "PW", "#7dd3fc", "Quote sent"], ["Jua Solar", "JS", "#fde68a", "On air"], ["Rafiki Bank", "RB", "#86efac", "Proof approved"],
];

function Column({ shift }: { shift: number }) {
  const cards = STREAM.map((_, i) => STREAM[(i * (shift + 2) + shift) % STREAM.length]);
  const run = (copy: number) => cards.map(([name, initials, colour, stage, hot], i) => <div className={`gate-card-sample${hot ? " hot" : ""}`} key={`${copy}-${i}`}>
    <span className="av" style={{ background: colour }}>{initials}</span><b>{name}</b><span><s style={{ width: `${50 + ((name.length * 13) % 45)}%` }} /></span><em>{stage}</em>
  </div>);
  return <div className="col"><div className="track">{run(0)}{run(1)}</div></div>;
}

/**
 * The full-screen frame for signing in and first-run setup: a dark brand panel with conversations
 * drifting past, and the task on the right. Below 1040px the panel shrinks to a heading strip.
 */
export default function MailGate({ title, text, points, corner, children, wide = false }: {
  title: string; text: string; points: [MailIconName, string][]; corner?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  return <div className="gate">
    <aside className="gate-brand">
      <div className="gate-stream" aria-hidden="true"><div className="tilt"><Column shift={0} /><Column shift={1} /><Column shift={2} /></div><div className="scrim" /></div>
      <div className="gate-logo"><KcaMark /><div><b>Booking Desk</b><small>Kwetu Connect Ads</small></div></div>
      <div className="gate-copy"><h1>{title}</h1><p>{text}</p><ul>{points.map(([icon, point]) => <li key={point}><MailIcon name={icon} size="sm" />{point}</li>)}</ul></div>
    </aside>
    <main className="gate-main">{corner && <div className="gate-corner">{corner}</div>}<div className={`gate-panel${wide ? " wide" : ""}`}>{children}</div></main>
  </div>;
}
