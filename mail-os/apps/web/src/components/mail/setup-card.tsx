"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { WorkspaceSetup } from "@kompanion/types";
import { Button, buttonClass } from "@/components/ui";
import { motionTime, reducedMotion } from "./motion";
import { setFirstDayFlag, useFirstDayFlag } from "./first-day-state";
import mail from "@/app/mail/page.module.css";
import s from "./first-day.module.css";

export const setupDone = (setup: WorkspaceSetup) => [setup.mailboxConnected, setup.teamInvited, setup.emailLookSaved, setup.quickReplySaved].every(Boolean);

export function SetupCard({ userId, setup, memberCount }: { userId: string; setup: WorkspaceSetup; memberCount: number }) {
  const hidden = useFirstDayFlag(userId, "setup-hidden");
  const finished = useFirstDayFlag(userId, "setup-finished");
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const complete = setupDone(setup);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!complete || finished) return;
    const timeout = setTimeout(() => setFirstDayFlag(userId, "setup-finished", true), reducedMotion() ? 0 : 4000);
    return () => clearTimeout(timeout);
  }, [complete, finished, userId]);
  if (complete) return finished ? null : <section className={`${mail.card} ${s.card} ${s.finished}`} role="status"><span className={s.circle} data-done="true"><Check size={12} aria-hidden /></span><span>Setup finished</span></section>;
  if (hidden) return null;
  const steps = [
    { title: "Connect your first mailbox", done: setup.mailboxConnected, text: "Use the address and password you sign in to webmail with", doneText: `${setup.firstMailboxEmail} is connected`, href: "/settings/mailboxes/connect", action: "Connect" },
    { title: "Invite your team", done: setup.teamInvited, text: "Send each person a link. You choose which mailboxes they see.", doneText: memberCount > 1 ? `${memberCount} people in the workspace` : "Invitation sent", href: "/settings/admin/users", action: "Invite" },
    { title: "Set how your emails look", done: setup.emailLookSaved, text: "Logo, colours and signature, added to every email you send", doneText: "Email appearance saved", href: "/settings/brand-kit", action: "Open" },
    { title: "Save your first quick reply", done: setup.quickReplySaved, text: "Starter replies are ready to edit", doneText: "Quick reply saved", href: "/settings/templates", action: "Write" },
  ];
  const first = steps.findIndex(step => !step.done);
  return <section className={`${mail.card} ${s.card}`} data-leaving={leaving} aria-labelledby="setup-title">
    <header className={s.header}><h2 id="setup-title">Set up Kwetu OS</h2><div><span className={mail.muted}>{steps.filter(step => step.done).length} of 4 done</span><Button variant="ghost" onClick={() => {
      setLeaving(true);
      timer.current = setTimeout(() => setFirstDayFlag(userId, "setup-hidden", true), motionTime("--t1"));
    }}>Hide setup</Button></div></header>
    <div className={s.progress} aria-hidden><span style={{ transform: `scaleX(${steps.filter(step => step.done).length / 4})` }} /></div>
    <ol className={s.steps}>{steps.map((step, index) => <li key={step.href} data-done={step.done}>
      <span className={s.circle} data-done={step.done} aria-hidden>{step.done && <Check size={12} />}</span>
      <div className={s.words}><h3>{step.title}<span className="sr-only">{step.done ? ", Done" : ", Not done"}</span></h3><p className={mail.muted}>{step.done ? step.doneText : step.text}</p></div>
      {!step.done && <Link href={step.href} className={buttonClass(index === first ? "primary" : "ghost")}>{step.action}</Link>}
    </li>)}</ol>
  </section>;
}
