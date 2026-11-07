"use client";

import { useState, type ReactNode } from "react";
import { Board, BoardMini, ClientAvatar, ClientTile, FlightPlan, HBars, Heatmap, HeatStrip, HourBars, LedBar, Meter, MiniBars, Segmented, Spark, StageTracker, StateBoard, StatusChip } from "@/components/signal";
import { dateKey, dayNumber } from "@/components/signal/scales";
import s from "./page.module.css";

const hours = [3, 2, 1, 1, 0, 1, 2, 6, 14, 22, 48, 31, 18, 12, 15, 11, 13, 17, 9, 6, 4, 3, 2, 1];
const today = "2026-10-22";
const heat = Object.fromEntries(Array.from({ length: 84 }, (_, index) => [dateKey(dayNumber(today) - index), (index * 7 + 3) % 11]));
const stages = [
  { id: "brief", label: "Brief received", state: "done", date: "28 Sep", dateTime: "2026-09-28" },
  { id: "artwork", label: "Artwork approved", state: "done", date: "9 Oct", dateTime: "2026-10-09" },
  { id: "install", label: "Install at Westlands", state: "now", date: "Today, 07:00", dateTime: "2026-10-22T07:00:00+03:00" },
  { id: "live", label: "Live on the board", state: "next", date: "23 Oct", dateTime: "2026-10-23" },
  { id: "report", label: "Proof of play", state: "next", date: "30 Oct", dateTime: "2026-10-30" },
] as const;
const sites = [
  { id: "westlands", name: "Westlands Roundabout", startDate: "2026-10-12", endDate: "2026-11-01" },
  { id: "thika", name: "Thika Road", startDate: "2026-10-19", endDate: "2026-11-15" },
  { id: "kilimani", name: "Kilimani", startDate: "2026-11-02", endDate: "2026-11-22" },
];

function Specimen({ number, title, children, wide = false }: { number: string; title: string; children: ReactNode; wide?: boolean }) {
  return <section className={`${s.specimen} ${wide ? s.wide : ""}`}><h2><span>{number}</span>{title}</h2><div className={s.sample}>{children}</div></section>;
}

export default function SignalDemoPage() {
  const [theme, setTheme] = useState<"day" | "night">("day");
  const [period, setPeriod] = useState("week");
  const [strength, setStrength] = useState("3");
  return <main className={`${s.demo} ${theme === "night" ? "dark" : ""}`} data-theme={theme}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>Kwetu OS / Development page</p><h1>Signal, in pieces.</h1><p className={s.intro}>Visual components with sample data. Select Day or Night to review the same collection.</p></div>
      <div className={s.themeSwitch}><Segmented label="Preview theme" value={theme} onChange={setTheme} options={[{ value: "day", label: "Day" }, { value: "night", label: "Night" }]} /></div>
    </header>
    <div className={s.grid}>
      <Specimen number="01" title="Spark"><div className={s.chartRow}><div><p className={s.metric}>128</p><p className={s.caption}>Conversations this week</p></div><Spark values={[24, 18, 31, 27, 40, 35, 52, 48, 68]} width={180} height={64} label="Conversation trend, rising from 24 to 68" /></div></Specimen>
      <Specimen number="02" title="MiniBars and HourBars"><MiniBars values={[2, 4, 3, 6, 8, 5, 9, 6, 4, 5, 3, 2]} height={38} label="Weekly volume sample" /><div className={s.rule} /><HourBars values={hours} label="Messages per hour, peak at 10:00 with 48 messages" colour="var(--good, #13864D)" /></Specimen>
      <Specimen number="03" title="HBars"><HBars label="Most used templates" items={[{ label: "Campaign live", value: 42 }, { label: "Site photographs", value: 28 }, { label: "Proof of play", value: 16 }]} /></Specimen>
      <Specimen number="04" title="Meter"><p className={s.caption}>Strength / {strength} of 4</p><Meter value={Number(strength)} label="Example password strength" /><Segmented label="Meter level" value={strength} onChange={setStrength} options={[0, 1, 2, 3, 4].map((level) => ({ value: String(level), label: String(level) }))} /></Specimen>
      <Specimen number="05" title="HeatStrip and Heatmap"><HeatStrip values={[0, 2, 5, 1, 7, 9, 4, 8, 3, 0, 6, 4, 7, 10]} label="Activity over 14 days" /><Heatmap values={heat} today={today} label="Activity over 12 weeks, through 22 October 2026" /></Specimen>
      <Specimen number="06" title="Board and BoardMini"><Board clientName="Mara Studio" headline="Make room for colour." colour="#A285F4" secondColour="#3CC8C0" /><div className={s.row}><BoardMini clientName="Cedar & Co." headline="Outside, together." colour="#8DCB5E" secondColour="#3CC8C0" /><span className={s.caption}>The same artwork at a glance</span></div></Specimen>
      <Specimen number="07" title="LedBar" wide><LedBar items={["Artwork approval due at 14:00", "Westlands installation tomorrow", "2 campaigns need your attention"]} /></Specimen>
      <Specimen number="08" title="StageTracker"><StageTracker stages={stages} label="October campaign stages" /></Specimen>
      <Specimen number="09" title="FlightPlan" wide><FlightPlan sites={sites} startDate="2026-10-12" today={today} label="Campaign sites, 12 October to 22 November 2026" colour="#3CC8C0" /><p className={s.caption}>Six weeks / Scroll the timeline on a narrow screen</p></Specimen>
      <Specimen number="10" title="ClientAvatar and StatusChip"><div className={s.row}><ClientAvatar name="Mara Studio" colour="#A285F4" size="small" /><ClientAvatar name="Northline Properties" colour="#3CC8C0" /><ClientAvatar name="Cedar & Co." colour="#8DCB5E" size="large" /></div><div className={s.row}><StatusChip label="Live" colour="var(--good, #13864D)" /><StatusChip label="Awaiting approval" colour="var(--warn, #8D6900)" /><StatusChip label="Attention" colour="var(--bad, #C63A2E)" /></div></Specimen>
      <Specimen number="11" title="ClientTile"><ClientTile name="Cedar & Co." initials="C" colour="#8DCB5E" description="Outdoor living / Nairobi" status="Live" href="#client-sample"><p id="client-sample">2 campaigns / 6 boards</p></ClientTile></Specimen>
      <Specimen number="12" title="Segmented"><Segmented label="Example reporting period" value={period} onChange={setPeriod} options={[{ value: "week", label: "Week", id: "period-week", panelId: "period-panel" }, { value: "month", label: "Month", id: "period-month", panelId: "period-panel" }, { value: "year", label: "Year", id: "period-year", panelId: "period-panel" }]} /><div id="period-panel" role="tabpanel" aria-labelledby={`period-${period}`} tabIndex={0}><p className={s.metric}>{period === "week" ? "128" : period === "month" ? "506" : "6,124"}</p><p className={s.caption}>Conversations this {period}</p></div></Specimen>
      <Specimen number="13" title="StateBoard" wide><p className={s.caption}>State variants are grouped here for development review.</p><div className={s.states}>{(["no-signal", "loading", "safi", "check-password", "ai-offline"] as const).map((state) => <StateBoard key={state} state={state} />)}</div></Specimen>
    </div>
    <footer className={s.footer}>Signal component library / Phase 3 / Sample data only</footer>
  </main>;
}
