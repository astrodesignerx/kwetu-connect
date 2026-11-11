import type { ReactNode } from "react";
import s from "./signal.module.css";

export type ClientAvatarProps = { name: string; initials?: string; size?: "small" | "medium" | "large" };

export function ClientAvatar({ name, initials, size = "medium" }: ClientAvatarProps) {
  const letters = initials ?? name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("en-GB");
  return <span className={`${s.root} ${s.avatar}`} data-size={size} role="img" aria-label={name}>{letters}</span>;
}

// Strong chips carry the one state that needs attention: solid dot, full weight.
// A waiting chip is a strong chip about time (waiting on us), so it is shown in ember.
export type StatusChipProps = { label: string; strong?: boolean; dot?: boolean; waiting?: boolean };

export function StatusChip({ label, strong = false, dot = true, waiting = false }: StatusChipProps) {
  return <span className={`${s.root} ${s.chip}`} data-strong={strong || waiting} data-waiting={waiting}>{dot && <i aria-hidden="true" />}{label}</span>;
}

export type ClientTileProps = { name: string; initials?: string; description?: string; status?: string; children?: ReactNode; href?: string; label?: string };

export function ClientTile({ name, initials, description, status, children, href, label }: ClientTileProps) {
  const content = <>
    <div className={s.clientCover}><ClientAvatar name={name} initials={initials} size="large" />{status && <StatusChip label={status} waiting={status === "Waiting on us"} />}</div>
    <div className={s.clientBody}><h3>{name}</h3>{description && <p>{description}</p>}{children}</div>
  </>;
  const className = `${s.root} ${s.clientTile}`;
  return href ? <a className={className} href={href} aria-label={label ?? name}>{content}</a> : <article className={className} aria-label={label ?? name}>{content}</article>;
}
