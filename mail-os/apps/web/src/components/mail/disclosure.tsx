"use client";

import { useEffect, useState, type ReactNode } from "react";
import s from "./compose.module.css";

export function MailDisclosure({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const [present, setPresent] = useState(open);
  const [visited, setVisited] = useState(open);
  if (open && !present) setPresent(true);
  if (open && !visited) setVisited(true);
  useEffect(() => {
    if (open || !present) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setPresent(false), reduced ? 0 : 200);
    return () => clearTimeout(timer);
  }, [open, present]);
  return <div id={id} hidden={!present} aria-hidden={!open} inert={!open} data-open={open} className={s.disclosure}>{visited && children}</div>;
}
