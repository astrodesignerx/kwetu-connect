import { dayNumber, flightPosition, shortDate, todayPosition, type SignalDate } from "./scales";
import { clientColour, hueStyle, type SignalStyle } from "./shared";
import s from "./signal.module.css";

export type StageTrackerProps = {
  label: string;
  stages: readonly { id: string; label: string; state: "done" | "now" | "next"; date: string; dateTime?: string }[];
};

export function StageTracker({ stages, label }: StageTrackerProps) {
  return <ol className={`${s.root} ${s.stages}`} aria-label={label}>
    {stages.map((stage, index) => <li key={stage.id} data-state={stage.state} aria-current={stage.state === "now" ? "step" : undefined} style={{ "--i": index } as SignalStyle}>
      <span className={s.stageDot} aria-hidden="true">{stage.state === "done" && <svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>}{stage.state === "now" && <i />}</span>
      <span><b>{stage.label}</b><time dateTime={stage.dateTime}>{stage.date}</time><span className={s.srOnly}>{stage.state}</span></span>
    </li>)}
  </ol>;
}

export type FlightSite = { id: string; name: string; startDate: SignalDate; endDate: SignalDate; label?: string; colour?: string };
export type FlightPlanProps = { sites: readonly FlightSite[]; startDate: SignalDate; today: SignalDate; label: string; colour?: string; todayLabel?: string };

export function FlightPlan({ sites, startDate, today, label, colour = clientColour, todayLabel = "Today" }: FlightPlanProps) {
  const start = dayNumber(startDate);
  const marker = todayPosition(today, startDate);
  return <div className={`${s.root} ${s.flightScroll} scroll-cue-x`} tabIndex={0} role="region" aria-label={label}>
    <div className={s.flight} style={hueStyle(colour)}>
      <div className={s.flightHeader}><span /><div>{Array.from({ length: 6 }, (_, week) => <span key={week}>{shortDate(start + week * 7)}</span>)}</div></div>
      {sites.map((site, index) => {
        const position = flightPosition(site.startDate, site.endDate, startDate);
        const text = site.label ?? `${shortDate(dayNumber(site.startDate))} to ${shortDate(dayNumber(site.endDate))}`;
        return <div className={s.flightRow} key={site.id}>
          <span title={site.name}>{site.name}</span><div className={s.flightTrack}>
            {position && <span className={s.flightBar} style={{ ...hueStyle(site.colour ?? colour), left: `${position.left}%`, width: `${position.width}%`, "--i": index } as SignalStyle} title={text}>{text}</span>}
            <span className={s.srOnly}>{text}</span>
          </div>
        </div>;
      })}
      {marker !== null && <div className={s.todayLayer} aria-hidden="true"><span className={s.today} style={{ left: `${marker}%` }}><b>{todayLabel}</b></span></div>}
    </div>
  </div>;
}
