import { clientColour, hueStyle, type SignalStyle } from "./shared";
import s from "./signal.module.css";

export type BoardProps = { clientName: string; headline: string; colour?: string; secondColour?: string; label?: string };

export function Board({ clientName, headline, colour = clientColour, secondColour = "#3CC8C0", label }: BoardProps) {
  return <div className={`${s.root} ${s.board}`} role="img" aria-label={label ?? `${clientName}: ${headline}`} style={{ "--a": colour, "--b": secondColour } as SignalStyle}>
    <div className={s.art} aria-hidden="true"><small>{clientName}</small><strong>{headline}</strong></div>
  </div>;
}

export function BoardMini(props: BoardProps) {
  return <div className={s.boardMini}><Board {...props} /></div>;
}

export type LedBarProps = { items: readonly string[]; label?: string; colour?: string };

export function LedBar({ items, label, colour = "var(--sodium, #FBB040)" }: LedBarProps) {
  return <div className={`${s.root} ${s.ledBar}`} role="img" aria-label={label ?? items.join(", ")} style={hueStyle(colour)}>
    <div className={s.ledRun} aria-hidden="true">{[0, 1].map((copy) => <div className={s.ledGroup} key={copy}>{items.map((item, index) => <span key={index}>{item}<i>/</i></span>)}</div>)}</div>
  </div>;
}

const states = {
  "no-signal": { text: "No signal", colour: "var(--muted, #9B9EB2)" },
  loading: { text: "Loading", colour: "var(--sodium, #FBB040)" },
  safi: { text: "Safi", colour: "var(--good, #4FD18B)" },
  "check-password": { text: "Check password", colour: "var(--bad, #FF6B5E)" },
  "ai-offline": { text: "AI offline", colour: "var(--jac, #A285F4)" },
} as const;

export type StateBoardProps = { state: keyof typeof states; text?: string; label?: string; colour?: string };

export function StateBoard({ state, text, label, colour }: StateBoardProps) {
  const preset = states[state];
  return <div className={`${s.root} ${s.stateBoard}`} role="status" aria-live="polite" aria-atomic="true" style={hueStyle(colour ?? preset.colour)}>
    <span className={s.srOnly}>{label ?? text ?? preset.text}</span>
    {state === "loading" ? <span className={s.loadingDots} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ "--i": index } as SignalStyle} />)}</span> : <span aria-hidden="true">{text ?? preset.text}</span>}
  </div>;
}
