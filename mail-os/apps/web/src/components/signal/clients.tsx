import type { ReactNode } from "react";
import { clientColour, hueStyle } from "./shared";
import s from "./signal.module.css";

export type ClientAvatarProps = { name: string; colour?: string; initials?: string; size?: "small" | "medium" | "large" };

export function ClientAvatar({ name, colour = clientColour, initials, size = "medium" }: ClientAvatarProps) {
  const letters = initials ?? name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("en-GB");
  return <span className={`${s.root} ${s.avatar}`} style={hueStyle(colour)} data-size={size} role="img" aria-label={name}>{letters}</span>;
}

export type StatusChipProps = { label: string; colour?: string; dot?: boolean };

export function StatusChip({ label, colour = clientColour, dot = true }: StatusChipProps) {
  return <span className={`${s.root} ${s.chip}`} style={hueStyle(colour)}>{dot && <i aria-hidden="true" />}{label}</span>;
}

export type ClientTileProps = { name: string; colour?: string; initials?: string; description?: string; status?: string; children?: ReactNode; href?: string; label?: string };

export function ClientTile({ name, colour = clientColour, initials, description, status, children, href, label }: ClientTileProps) {
  const content = <>
    <div className={s.clientCover}><ClientAvatar name={name} colour={colour} initials={initials} size="large" />{status && <StatusChip label={status} colour={colour} />}</div>
    <div className={s.clientBody}><h3>{name}</h3>{description && <p>{description}</p>}{children}</div>
  </>;
  const props = { className: `${s.root} ${s.clientTile}`, style: hueStyle(colour) };
  return href ? <a {...props} href={href} aria-label={label ?? name}>{content}</a> : <article {...props} aria-label={label ?? name}>{content}</article>;
}
