import { hueStyle, type SignalStyle } from "./shared";
import s from "./signal.module.css";

export type BoardProps = { clientName: string; headline: string; colour?: string; secondColour?: string; label?: string };

export function Board({ clientName, headline, colour = "#303030", secondColour = "#636363", label }: BoardProps) {
  return <div className={`${s.root} ${s.board}`} role="img" aria-label={label ?? `${clientName}: ${headline}`} style={{ "--a": colour, "--b": secondColour } as SignalStyle}>
    <div className={s.art} aria-hidden="true"><small>{clientName}</small><strong>{headline}</strong></div>
  </div>;
}

export function BoardMini(props: BoardProps) {
  return <div className={s.boardMini}><Board {...props} /></div>;
}

export type LedBarProps = { items: readonly string[]; label?: string; colour?: string };

export function LedBar({ items, label, colour = "#f2f2f2" }: LedBarProps) {
  return <div className={`${s.root} ${s.ledBar}`} role="img" aria-label={label ?? items.join(", ")} style={hueStyle(colour)}>
    <div className={s.ledRun} aria-hidden="true">{[0, 1].map((copy) => <div className={s.ledGroup} key={copy}>{items.map((item, index) => <span key={index}>{item}<i>/</i></span>)}</div>)}</div>
  </div>;
}

const states = {
  "no-signal": { text: "No signal", colour: "#a3a3a3" },
  loading: { text: "Loading", colour: "#f2f2f2" },
  safi: { text: "Safi", colour: "#f2f2f2" },
  "check-password": { text: "Check password", colour: "#f2f2f2" },
  "ai-offline": { text: "AI offline", colour: "#a3a3a3" },
} as const;

export type StateBoardProps = { state: keyof typeof states; text?: string; label?: string; colour?: string };

export function StateBoard({ state, text, label, colour }: StateBoardProps) {
  const preset = states[state];
  return <div className={`${s.root} ${s.stateBoard}`} role="status" aria-live="polite" aria-atomic="true" style={hueStyle(colour ?? preset.colour)}>
    <span className={s.srOnly}>{label ?? text ?? preset.text}</span>
    {state === "loading" ? <span className={s.loadingDots} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ "--i": index } as SignalStyle} />)}</span> : <span aria-hidden="true">{text ?? preset.text}</span>}
  </div>;
}
