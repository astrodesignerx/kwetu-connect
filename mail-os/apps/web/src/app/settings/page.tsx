"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { settingsApi, utcHourValues, auditLabel } from "@/lib/signal-settings";
import { renderBrandPreview } from "@/lib/brand-preview";
import { HeatStrip, HourBars } from "@/components/signal";
import { Avatar, HealthLight, SettingsHeader, SettingsState, Stat, dateTime } from "@/components/settings/settings";
import s from "./page.module.css";

export default function SettingsHubPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "Admin";
  const workspace = useQuery({ queryKey: ["workspace-overview"], queryFn: ({ signal }) => settingsApi.overview(signal) });
  const mailboxes = useQuery({ queryKey: ["mailboxes"], queryFn: api.listMailboxes });
  const firstMailbox = mailboxes.data?.[0];
  const sync = useQuery({ queryKey: ["sync-stats", firstMailbox?.id], queryFn: ({ signal }) => settingsApi.syncStats(firstMailbox!.id, signal), enabled: !!firstMailbox });
  const kit = useQuery({ queryKey: ["brand-kit"], queryFn: api.getBrandKit });
  const templates = useQuery({ queryKey: ["templates"], queryFn: api.listTemplates });
  const team = useQuery({ queryKey: ["admin-users"], queryFn: api.adminListUsers, enabled: isAdmin });
  const audit = useQuery({ queryKey: ["admin-audit-daily"], queryFn: ({ signal }) => settingsApi.dailyAudit(signal), enabled: isAdmin });
  const recent = useQuery({ queryKey: ["admin-audit"], queryFn: api.adminAuditLog, enabled: isAdmin });

  if (workspace.isPending) return <SettingsState loading />;
  if (workspace.isError) return <SettingsState error={workspace.error} retry={() => void workspace.refetch()} />;
  const data = workspace.data;
  return <div className={s.page}>
    <SettingsHeader title="Settings" context="" description="Your workspace, in good order." />
    <section className={s.banner}>
      <span className={s.mark} aria-hidden="true">k</span><div className={s.workspace}><small>Workspace</small><h2>{data.workspaceName}</h2></div>
      <div className={s.numbers}><Stat value={data.memberCount} label="people" /><Stat value={data.mailboxCount} label="mailboxes" /><Stat value={data.templateCount} label="templates" /><Stat value={data.sendsLast30Days} label="sends / last 30 days" /></div>
    </section>
    <div className={s.tiles}>
      <Tile href="/settings/profile" title="Profile">
        <div className={s.person}><Avatar name={user?.displayName ?? ""} /><div><b>{user?.displayName}</b><small>{user?.role}</small></div></div>
        <p className={s.note}>@{user?.username}<br />Password guidance in your profile</p>
      </Tile>
      <Tile href="/settings/mailboxes" title="Mailboxes" wide>
        {mailboxes.isPending ? <span className={s.note}>Loading your connections</span> : mailboxes.isError ? <span className={s.note}>Connections unavailable</span> : firstMailbox ? <>
          <div className={s.meta}>{sync.data && <HealthLight state={sync.data.syncState} />}<span>{firstMailbox.email}</span><span>{sync.data ? sync.data.conversationCount + " conversations" : ""}</span></div>
          {sync.data ? <><HourBars values={utcHourValues(sync.data.hourly)} highlightPeak={false} label="Fetched messages in the last 24 hours, grouped by UTC hour of day" height={68} /><span className={s.note}>Last 24 hours by UTC hour / {sync.data.messagesSynced} fetched</span></> : <span className={s.note}>{sync.isError ? "Sync history unavailable" : "Loading sync history"}</span>}
        </> : <span className={s.note}>Connect your first mailbox</span>}
        {data.mailboxHealth.needsAttention > 0 && <span className={s.attention}>{data.mailboxHealth.needsAttention === 1 ? "1 workspace connection needs attention" : `${data.mailboxHealth.needsAttention} workspace connections need attention`}</span>}
      </Tile>
      <Tile href="/settings/brand-kit" title="Email appearance" half>
        {kit.data ? <div className={s.brand}><div className={s.preview}><iframe tabIndex={-1} title="Saved email appearance" sandbox="" srcDoc={renderBrandPreview(kit.data)} /></div><span className={s.swatches}>{[kit.data.primaryColor, kit.data.accentColor, kit.data.textColor, kit.data.backgroundColor].map((colour, index) => <i key={index} style={{ background: colour || "var(--raise)" }} title={colour || "Default"} />)}</span></div> : <span className={s.note}>{kit.isError ? "Appearance unavailable" : "Loading appearance"}</span>}
      </Tile>
      <Tile href="/settings/templates" title="Templates" half>
        <strong className={s.count}>{data.templateCount}<small>saved templates</small></strong>
        <ul className={s.templateList}>{templates.data?.slice(0, 3).map((template) => <li key={template.id}>{template.name}</li>)}</ul>
        {templates.isError && <span className={s.note}>Template list unavailable</span>}
      </Tile>
      {isAdmin && <>
        <Tile href="/settings/admin/users" title="Team" half>
          <div className={s.avatars}>{team.data?.slice(0, 5).map((person) => <Avatar key={person.id} name={person.displayName} />)}</div>
          <span className={s.note}>{data.pendingInvitations} pending invitations</span>
          {team.isError && <span className={s.note}>People unavailable</span>}
        </Tile>
        <Tile href="/settings/admin/audit" title="Audit log" half>
          {audit.data ? <div className={s.activity}><HeatStrip values={audit.data.days.slice(-14).map((day) => day.count)} label="Administrative activity in the last 14 days" /></div> : <span className={s.note}>{audit.isError ? "Activity unavailable" : "Loading activity"}</span>}
          <p className={s.note}>{recent.data?.[0] ? <><time dateTime={recent.data[0].createdAt}>{dateTime(recent.data[0].createdAt)}</time><br />{auditLabel(recent.data[0].action)}</> : recent.isError ? "Latest event unavailable" : "No recorded events"}</p>
        </Tile>
      </>}
    </div>
  </div>;
}

function Tile({ href, title, wide, half, children }: { href: string; title: string; wide?: boolean; half?: boolean; children: React.ReactNode }) {
  return <Link href={href} className={[s.tile, wide ? s.wide : half ? s.half : s.narrow].join(" ")}><header><h3>{title}</h3><ArrowUpRight size={16} aria-hidden="true" /></header>{children}</Link>;
}
