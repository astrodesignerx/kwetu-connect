import type { CSSProperties } from "react";
export function Ring({ value, label, small = false }: { value: number; label: string; small?: boolean }) {
  const percent = Math.round(value * 100);
  return <div className={"ns-ring" + (small ? " is-small" : "")} role="img" aria-label={percent + "% " + label}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r="52" /><circle className="ring-value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100" style={{ "--ring-offset": 100 - Math.max(0, Math.min(100, percent)), strokeDashoffset: 100 - Math.max(0, Math.min(100, percent)) } as CSSProperties} /></svg><div><strong key={percent} className="rolling-number">{percent}%</strong><span>{label}</span></div></div>;
}
/** Smooth line through the points that never dips past a neighbour (monotone cubic), so a small week cannot overshoot below zero. */
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : "";
  const slopes = points.slice(1).map(([x, y], index) => (y - points[index][1]) / (x - points[index][0]));
  const tangents = points.map((_, index) => index === 0 ? slopes[0] : index === points.length - 1 ? slopes[index - 1] : slopes[index - 1] * slopes[index] <= 0 ? 0 : 2 * slopes[index - 1] * slopes[index] / (slopes[index - 1] + slopes[index]));
  return points.slice(1).reduce((path, [x, y], index) => {
    const [x0, y0] = points[index];
    const third = (x - x0) / 3;
    return `${path} C${x0 + third},${y0 + tangents[index] * third} ${x - third},${y - tangents[index + 1] * third} ${x},${y}`;
  }, `M${points[0][0]},${points[0][1]}`);
}
export function RevenueChart({ weeks }: { weeks: { from: string; kes: number; count: number }[] }) {
  // The y axis starts at zero, so a small week looks small.
  const max = Math.max(1, ...weeks.map((week) => week.kes));
  const points = weeks.map((week, index): [number, number] => [10 + index * 45, 90 - week.kes / max * 74]);
  const line = smoothPath(points);
  const last = points[points.length - 1];
  return <figure className="revenue-chart"><div className="chart-plot"><svg viewBox="0 0 290 100" preserveAspectRatio="none" role="img" aria-label="Value of bookings created in the last seven weeks, cancelled excluded">{last && <><path d={`${line} L${last[0]},90 L${points[0][0]},90 Z`} className="chart-area" /><path d={line} className="chart-line" pathLength="1" vectorEffect="non-scaling-stroke" /><line x1={last[0]} x2={last[0]} y1={last[1]} y2="90" className="chart-drop" vectorEffect="non-scaling-stroke" /></>}</svg>{last && <span className="chart-dot" aria-hidden="true" style={{ left: (last[0] / 290 * 100) + "%", top: last[1] + "%" }} />}</div><figcaption>Last 7 weeks / created bookings</figcaption><details><summary className="sr-only focus:not-sr-only">Chart figures</summary><ul>{weeks.map((week) => <li key={week.from}>{week.from}: KES {week.kes.toLocaleString("en-GB")}, {week.count} bookings</li>)}</ul></details></figure>;
}
