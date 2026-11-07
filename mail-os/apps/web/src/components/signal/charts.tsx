import { barScale, finite, heatmapGrid, positiveValues, sparkPoints, type SignalDate } from "./scales";
import { clientColour, hueStyle, type SignalStyle } from "./shared";
import s from "./signal.module.css";

export type SparkProps = {
  values: readonly number[];
  label: string;
  colour?: string;
  width?: number;
  height?: number;
};

export function Spark({ values, label, colour = clientColour, width = 132, height = 40 }: SparkProps) {
  const w = Math.max(12, finite(width, 132));
  const h = Math.max(12, finite(height, 40));
  const points = sparkPoints(values, w, h);
  const line = points.map(({ x, y }, index) => `${index ? "L" : "M"}${x},${y}`).join(" ");
  const last = points.at(-1);
  return (
    <svg className={`${s.root} ${s.spark}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={hueStyle(colour)} role="img" aria-label={label}>
      {last && <>
        <path className={s.sparkArea} d={`${line} L${last.x},${h} L${points[0].x},${h} Z`} />
        <path className={s.sparkLine} d={line} />
        <circle cx={last.x} cy={last.y} r="3.5" />
      </>}
    </svg>
  );
}

export type MiniBarsProps = {
  values: readonly number[];
  label: string;
  colour?: string;
  height?: number;
  highlightPeak?: boolean;
};

export function MiniBars({ values, label, colour = clientColour, height = 54, highlightPeak = false }: MiniBarsProps) {
  const { heights, peak } = barScale(values);
  const style: SignalStyle = { ...hueStyle(colour), height: Math.max(12, finite(height, 54)), gridTemplateColumns: `repeat(${Math.max(1, values.length)}, minmax(0, 1fr))` };
  return (
    <div className={`${s.root} ${s.miniBars}`} style={style} role="img" aria-label={label}>
      {heights.map((value, index) => <span key={index} className={highlightPeak && index === peak ? s.peak : undefined} style={{ height: `${value}%`, "--i": index } as SignalStyle} />)}
    </div>
  );
}

export type HourBarsProps = Omit<MiniBarsProps, "values"> & { values: readonly number[] };

export function HourBars({ values, label, highlightPeak = true, height = 84, ...props }: HourBarsProps) {
  const hours = Array.from({ length: 24 }, (_, hour) => values[hour] ?? 0);
  return (
    <div className={s.root}>
      <MiniBars {...props} values={hours} label={label} height={height} highlightPeak={highlightPeak} />
      <div className={s.hourAxis} aria-hidden="true">{["00", "06", "12", "18"].map((hour) => <span key={hour}>{hour}</span>)}</div>
    </div>
  );
}

export type HBarsProps = {
  items: readonly { label: string; value: number; colour?: string }[];
  label: string;
  colour?: string;
};

export function HBars({ items, label, colour = clientColour }: HBarsProps) {
  const { heights } = barScale(items.map((item) => item.value));
  return (
    <ul className={`${s.root} ${s.hBars}`} aria-label={label} style={hueStyle(colour)}>
      {items.map((item, index) => <li key={`${item.label}-${index}`}>
        <span title={item.label}>{item.label}</span>
        <span className={s.hBarTrack} aria-hidden="true"><i style={{ ...hueStyle(item.colour ?? colour), width: `${heights[index]}%`, "--i": index } as SignalStyle} /></span>
        <b>{finite(item.value)}</b>
      </li>)}
    </ul>
  );
}

export type MeterProps = { value: number; label: string; colour?: string };

export function Meter({ value, label, colour = "var(--good, #13864D)" }: MeterProps) {
  const level = Math.min(4, Math.max(0, Math.trunc(finite(value))));
  return <div className={`${s.root} ${s.meter}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={4} aria-valuenow={level} style={hueStyle(colour)}>
    {Array.from({ length: 4 }, (_, index) => <span key={index} aria-hidden="true"><i style={{ transform: `scaleX(${index < level ? 1 : 0})` }} /></span>)}
  </div>;
}

export type HeatStripProps = { values: readonly number[]; label: string; colour?: string; max?: number };

function intensity(value: number, max: number) {
  return max <= 0 ? 0 : Math.min(100, Math.max(0, finite(value)) / max * 100);
}

export function HeatStrip({ values, label, colour = clientColour, max }: HeatStripProps) {
  const ceiling = Math.max(0, finite(max ?? Math.max(0, ...positiveValues(values))));
  return <div className={`${s.root} ${s.heatStrip}`} role="img" aria-label={label} style={{ ...hueStyle(colour), gridTemplateColumns: `repeat(${Math.max(1, values.length)}, minmax(0, 1fr))` }}>
    {values.map((value, index) => <span key={index} style={{ "--intensity": `${intensity(value, ceiling)}%`, "--i": index } as SignalStyle} />)}
  </div>;
}

export type HeatmapProps = {
  values: Readonly<Record<string, number>>;
  today: SignalDate;
  label: string;
  weeks?: number;
  colour?: string;
  max?: number;
  weekdays?: readonly [string, string, string, string, string, string, string];
};

export function Heatmap({ values, today, label, weeks = 12, colour = clientColour, max, weekdays = ["M", "T", "W", "T", "F", "S", "S"] }: HeatmapProps) {
  const grid = heatmapGrid(today, weeks);
  const ceiling = Math.max(0, finite(max ?? Math.max(0, ...grid.columns.flat().filter((cell) => !cell.future).map((cell) => finite(values[cell.date] ?? 0)))));
  const style: SignalStyle = { ...hueStyle(colour), gridTemplateColumns: `24px repeat(${grid.columns.length}, minmax(0, 1fr))` };
  return <div className={`${s.root} ${s.heatmapScroll}`} tabIndex={0} role="region" aria-label={label}>
    <div className={s.heatmap} style={style}>
      {grid.months.map((month, index) => <span key={month.date} className={s.month} style={{ gridColumn: `${month.week + 2} / ${grid.months[index + 1] ? grid.months[index + 1].week + 2 : grid.columns.length + 2}`, gridRow: 1 }}>{month.label}</span>)}
      {weekdays.map((day, index) => <span key={index} className={s.weekday} style={{ gridColumn: 1, gridRow: index + 2 }} aria-hidden="true">{day}</span>)}
      {grid.columns.flat().map((cell, index) => <span key={cell.date} className={`${s.heatCell} ${cell.future ? s.future : ""}`} title={`${cell.date}: ${cell.future ? "Future" : finite(values[cell.date] ?? 0)}`} aria-label={`${cell.date}: ${cell.future ? "Future" : finite(values[cell.date] ?? 0)}`} role="img" style={{ gridColumn: cell.week + 2, gridRow: cell.weekday + 2, "--intensity": `${intensity(values[cell.date] ?? 0, ceiling)}%`, "--i": index } as SignalStyle} />)}
    </div>
  </div>;
}
