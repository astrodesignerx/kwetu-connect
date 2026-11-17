"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { motionTime } from "./motion";
import { setFirstDayFlag, useFirstDayFlag } from "./first-day-state";
import mail from "@/app/mail/page.module.css";
import s from "./first-day.module.css";

export function mailboxWords(addresses: string[]) {
  if (addresses.length > 3) return `${addresses.slice(0, 2).join(", ")} and ${addresses.length - 2} more`;
  return addresses.length < 2 ? addresses.join("") : `${addresses.slice(0, -1).join(", ")} and ${addresses.at(-1)}`;
}

export function WelcomeCard({ userId, displayName, mailboxes, onOpen }: {
  userId: string; displayName: string; mailboxes: { email: string }[]; onOpen: () => void;
}) {
  const dismissed = useFirstDayFlag(userId, "welcome-dismissed");
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (dismissed || !mailboxes.length) return null;
  return <section className={`${mail.card} ${s.card} ${s.welcome}`} data-leaving={leaving} aria-labelledby="welcome-title">
    <h2 id="welcome-title">Welcome, {displayName.trim().split(/\s+/)[0]}</h2>
    <p>You can see <strong>{mailboxWords(mailboxes.map(box => box.email))}</strong>.</p>
    <p>A conversation with your initials on it is yours. The orange time shows how long the client has waited.</p>
    <div className={s.shortcuts} aria-label="Inbox shortcuts">
      {[["J", "Next conversation"], ["K", "Previous conversation"], ["R", "Reply"], ["E", "Archive"]].map(([key, meaning]) => <div key={key}><kbd>{key}</kbd><span>{meaning}</span></div>)}
    </div>
    <Button disabled={leaving} onClick={() => {
      setLeaving(true);
      timer.current = setTimeout(() => { setFirstDayFlag(userId, "welcome-dismissed", true); onOpen(); }, motionTime("--t1"));
    }}>Open the inbox</Button>
  </section>;
}
