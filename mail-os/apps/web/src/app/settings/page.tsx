"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Layers, Mail, Palette, ScrollText, UserRound, Users, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { plural } from "@/lib/format";
import { settingsApi, auditLabel } from "@/lib/signal-settings";
import { SettingsHeader, SettingsState, dateTime } from "@/components/settings/settings";
import s from "./page.module.css";

export default function SettingsHubPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "Admin";
  const workspace = useQuery({ queryKey: ["workspace-overview"], queryFn: ({ signal }) => settingsApi.overview(signal) });
  const kit = useQuery({ queryKey: ["brand-kit"], queryFn: api.getBrandKit });
  const recent = useQuery({ queryKey: ["admin-audit"], queryFn: api.adminAuditLog, enabled: isAdmin });

  if (workspace.isPending) return <SettingsState loading />;
  if (workspace.isError) return <SettingsState error={workspace.error} retry={() => void workspace.refetch()} />;
  const data = workspace.data;
  const attention = data.mailboxHealth.needsAttention;
  const parts = kit.data ? [kit.data.headerHtml && "header", kit.data.signatureHtml && "signature", kit.data.footerHtml && "footer"].filter(Boolean) as string[] : [];
  const latest = recent.data?.[0];
  return <div className={s.page}>
    <SettingsHeader title="Settings" context=""
      description={`${data.workspaceName}: ${plural(data.memberCount, "person", "people")}, ${plural(data.mailboxCount, "mailbox", "mailboxes")}, ${plural(data.templateCount, "template")}, ${plural(data.sendsLast30Days, "send")} in the last 30 days`} />
    <nav className={s.list} aria-label="Settings">
      <Row href="/settings/profile" icon={UserRound} title="Profile">
        {user ? `${user.displayName}, ${user.role}` : "Your name, sign-in and password"}
      </Row>
      <Row href="/settings/mailboxes" icon={Mail} title="Mailboxes">
        {data.mailboxCount === 0 ? "No mailbox connected" : <>
          {plural(data.mailboxCount, "mailbox", "mailboxes")} connected
          {attention > 0 ? <>, <b>{attention === 1 ? "1 needs attention" : `${attention} need attention`}</b></> : ", all syncing"}
        </>}
      </Row>
      <Row href="/settings/brand-kit" icon={Palette} title="Email appearance">
        {kit.isPending ? "Loading appearance" : kit.isError || !kit.data ? "Appearance unavailable" : <>
          <span className={s.swatches} aria-hidden="true">{[kit.data.primaryColor, kit.data.accentColor, kit.data.textColor, kit.data.backgroundColor].map((colour, index) => <i key={index} data-user-colour style={{ background: colour || "var(--raise)" }} />)}</span>
          {parts.length ? `${capitalise(listOf(parts))} set` : "Plain email, no header or signature"}
        </>}
      </Row>
      <Row href="/settings/templates" icon={Layers} title="Templates">
        {data.templateCount === 0 ? "No templates yet" : plural(data.templateCount, "saved template")}
      </Row>
      {isAdmin && <>
        <Row href="/settings/admin/users" icon={Users} title="Team">
          {plural(data.memberCount, "person", "people")}
          {!!data.pendingInvitations && <>, {plural(data.pendingInvitations, "pending invitation")}</>}
        </Row>
        <Row href="/settings/admin/audit" icon={ScrollText} title="Audit log">
          {latest ? <>{auditLabel(latest.action)}, <time dateTime={latest.createdAt}>{dateTime(latest.createdAt)}</time></> : recent.isPending ? "Loading events" : recent.isError ? "Latest event unavailable" : "No recorded events"}
        </Row>
      </>}
    </nav>
  </div>;
}

function Row({ href, icon: Icon, title, children }: { href: string; icon: LucideIcon; title: string; children: React.ReactNode }) {
  return <Link href={href} className={s.row}>
    <Icon size={18} aria-hidden="true" className={s.icon} />
    <span className={s.title}>{title}</span>
    <span className={s.status}>{children}</span>
    <ChevronRight size={16} aria-hidden="true" className={s.chevron} />
  </Link>;
}

function listOf(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
