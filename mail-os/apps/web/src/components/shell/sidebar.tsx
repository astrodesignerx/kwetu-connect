"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FileText, Inbox, Layers, LogOut, Mail, MoreHorizontal, Plus, Send, Settings, Users, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { endSession } from "@/lib/session";
import { useAllDrafts } from "@/lib/use-all-drafts";
import { initialsFor } from "@/lib/avatar";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DraftCount } from "./draft-count";

export const DESTINATIONS = [
  { label: "Mail", href: "/mail", icon: Mail },
  { label: "Drafts", href: "/drafts", icon: FileText },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Templates", href: "/settings/templates", icon: Layers },
  { label: "Settings", href: "/settings", icon: Settings },
];
export const FOLDERS = [
  { key: "inbox", label: "Inbox", count: "inbox" },
  { key: "unread", label: "Unread", count: "unread" },
  { key: "assigned", label: "Assigned", count: "mine" },
  { key: "sent", label: "Sent", count: "sent" },
  { key: "archive", label: "Archive", count: "archive" },
  { key: "all", label: "All mail", count: "all" },
] as const;

export function Sidebar({ onCompose, onNavigate, compact = false }: { onCompose: () => void; onNavigate: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const { mailboxes } = useAllDrafts();
  const mailboxId = params.get("m") ?? mailboxes[0]?.id;
  const { data: counts } = useQuery({ queryKey: ["thread-counts", mailboxId],
    queryFn: () => api.threadCounts(mailboxId!), enabled: !!mailboxId });
  const { data: clients } = useQuery({ queryKey: ["companies"], queryFn: api.listCompanies });
  const onMail = pathname === "/mail" || pathname === "/dev/mail";
  const folder = params.get("folder") ?? "inbox";
  function folderHref(key: string) {
    const next = new URLSearchParams();
    if (mailboxId) next.set("m", mailboxId);
    if (key !== "inbox") next.set("folder", key);
    return `${pathname === "/dev/mail" ? pathname : "/mail"}?${next}`;
  }
  if (compact) return <aside className="mail-rail" aria-label="Kwetu OS navigation">
    <Link href={folderHref("inbox")} className="mail-rail-brand" aria-label="Kwetu OS inbox"><Logo /></Link>
    <nav aria-label="Main">
      {[
        { label: "Inbox", href: folderHref("inbox"), icon: Mail, active: onMail && folder === "inbox", count: counts?.unread },
        { label: "Assigned", href: folderHref("assigned"), icon: UserRound, active: onMail && folder === "assigned" },
        { label: "Drafts", href: "/drafts", icon: FileText, active: pathname.startsWith("/drafts") },
        { label: "Sent", href: folderHref("sent"), icon: Send, active: onMail && folder === "sent" },
        { label: "Archive", href: folderHref("archive"), icon: Archive, active: onMail && folder === "archive" },
        { label: "Clients", href: "/clients", icon: Users, active: pathname.startsWith("/clients") },
        { label: "Templates", href: "/settings/templates", icon: Layers, active: pathname.startsWith("/settings/templates") },
      ].map((item) => <Link key={item.label} href={item.href} aria-label={item.label} aria-current={item.active ? "page" : undefined}>
        <item.icon size={18} aria-hidden /><span>{item.label}</span>{item.count ? <small>{item.count}</small> : null}
      </Link>)}
      <button type="button" onClick={onNavigate} aria-label="Mail folders and mailboxes" aria-haspopup="dialog"><MoreHorizontal size={18} aria-hidden /><span>More</span></button>
    </nav>
    <nav className="mail-rail-bottom" aria-label="Account">
      <Link href="/settings" aria-label="Settings" aria-current={pathname.startsWith("/settings") && !pathname.startsWith("/settings/templates") ? "page" : undefined}><Settings size={18} aria-hidden /><span>Settings</span></Link>
      <Link href="/settings/profile" aria-label="Your profile" title={user?.displayName ?? "Your profile"} className="mail-rail-avatar">{initialsFor(user?.displayName ?? user?.email ?? "?")}</Link>
    </nav>
  </aside>;
  return (
    <aside className="signal-sidebar" aria-label="Kwetu OS navigation">
      <Link href="/mail" className="signal-brand" onClick={onNavigate}><Logo /><span>Kwetu OS</span></Link>
      <Button className="signal-new-message" onClick={onCompose}><Plus size={16} aria-hidden />New email</Button>
      <nav aria-label="Main" className="signal-primary-nav">
        {DESTINATIONS.map((route) => {
          const active = route.href === "/settings"
            ? pathname.startsWith("/settings") && !pathname.startsWith("/settings/templates")
            : pathname.startsWith(route.href);
          const count = route.href === "/mail" ? counts?.unread
            : route.href === "/clients" ? clients?.length : undefined;
          return <Link key={route.href} href={route.href === "/mail" ? folderHref("inbox") : route.href}
            onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("signal-nav-link", active && "is-active")}>
            <route.icon size={18} aria-hidden /><span>{route.label}</span>
            {route.href === "/drafts" && <DraftCount />}
            {count !== undefined && count > 0 && <span className="signal-count">{count}</span>}
          </Link>;
        })}
      </nav>
      <div className="signal-sidebar-context">
        {onMail && <details className="signal-mail-context" open>
          <summary><Inbox size={14} aria-hidden />Mail folders</summary>
          <nav aria-label="Mail folders">
            {FOLDERS.map((item) => <Link href={folderHref(item.key)} key={item.key} onClick={onNavigate}
              aria-current={folder === item.key ? "page" : undefined} className="signal-folder">
              <span>{item.label}</span>{!!counts?.[item.count] && <small>{counts[item.count]}</small>}
            </Link>)}
          </nav>
          <label className="signal-mailbox-label">Mailbox
            <select aria-label="Mailbox" value={mailboxId ?? ""} onChange={(event) => {
              const next = new URLSearchParams(params);
              next.set("m", event.target.value); next.delete("id");
              router.push(`/mail?${next}`);
              onNavigate();
            }}>
              {!mailboxes.length && <option value="">No mailbox connected</option>}
              {mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email}</option>)}
            </select>
          </label>
          <Link className="signal-connect" href="/settings/mailboxes/connect" onClick={onNavigate}><Plus size={14} aria-hidden />Connect a mailbox</Link>
        </details>}
      </div>
      <div className="signal-user-row">
        <Link href="/settings/profile" className="signal-user" onClick={onNavigate} title="Open profile">
          <span className="signal-avatar">{initialsFor(user?.displayName ?? user?.email ?? "?")}</span>
          <span className="signal-user-text"><strong>{user?.displayName ?? "Your account"}</strong><small>{user?.email}</small></span>
          <UserRound size={16} aria-hidden />
        </Link>
        <Button variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={() => {
          endSession(queryClient); onNavigate();
        }}><LogOut size={16} /></Button>
      </div>
    </aside>
  );
}
