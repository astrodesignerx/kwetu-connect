import type { CSSProperties } from "react";
export function Ring({ value, label, small = false }: { value: number; label: string; small?: boolean }) {
  const percent = Math.round(value * 100);
  return <div className={"ns-ring" + (small ? " is-small" : "")} role="img" aria-label={percent + "% " + label}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r="52" /><circle className="ring-value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" style={{ "--ring-offset": 100 - Math.max(0, Math.min(100, percent)), strokeDashoffset: 100 - Math.max(0, Math.min(100, percent)) } as CSSProperties} /></svg><div><strong key={percent} className="rolling-number">{percent}%</strong><span>{label}</span></div></div>;
}
export function RevenueChart({ weeks }: { weeks: { from: string; kes: number; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.kes));
  const points = weeks.map((week, index) => (10 + index * 45) + "," + (90 - week.kes / max * 74)).join(" ");
  return <figure className="revenue-chart"><svg viewBox="0 0 290 100" role="img" aria-label="Value of bookings created in the last seven weeks, cancelled excluded"><polygon points={"10,96 " + points + " 280,96"} className="chart-area" /><polyline points={points} className="chart-line" pathLength="1" /></svg><figcaption>Last 7 weeks / created bookings</figcaption><details><summary className="sr-only focus:not-sr-only">Chart figures</summary><ul>{weeks.map((week) => <li key={week.from}>{week.from}: KES {week.kes.toLocaleString("en-GB")}, {week.count} bookings</li>)}</ul></details></figure>;
}
