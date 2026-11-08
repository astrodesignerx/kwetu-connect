"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { Topbar } from "@/components/topbar";
import { Sidebar, DESTINATIONS, FOLDERS } from "@/components/shell/sidebar";
import { CommandPalette, type Command } from "@/components/shell/command-palette";
import { ShellDialog } from "@/components/shell/dialog";
import { toggleTheme } from "@/components/shell/theme";
import { Button } from "@/components/ui";
import { X } from "lucide-react";
import "@/components/mail/mail-shell.css";

export interface AppShellProps { children: React.ReactNode; variant?: "app" | "content" }

export function AppShell(props: AppShellProps) {
  const { ready } = useRequireAuth();
  if (!ready) return null;
  return <Suspense fallback={<div className="signal-frame" />}><ShellContent {...props} /></Suspense>;
}

export function ShellContent({ children, variant = "content" }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const mailMode = pathname === "/mail" || pathname === "/dev/mail";
  const params = useSearchParams();
  const [palette, setPalette] = useState(false);
  const [paletteKey, setPaletteKey] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const { data: overview } = useQuery({ queryKey: ["overview"], queryFn: api.mailOverview });
  const mailboxId = params.get("m") ?? overview?.mailboxes[0]?.id;

  function openPalette() { setDrawer(false); setHelp(false); setPaletteKey((key) => key + 1); setPalette(true); }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDrawer(false); setHelp(false);
        if (!palette) setPaletteKey((key) => key + 1);
        setPalette(!palette);
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true], dialog") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "/") { event.preventDefault(); setPaletteKey((key) => key + 1); setPalette(true); }
      if (event.key === "?") { event.preventDefault(); setHelp((value) => !value); }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [palette]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 860px)");
    const update = () => { if (media.matches) setDrawer(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function mailHref(values: Record<string, string>, preserve = false) {
    const next = new URLSearchParams(preserve && mailMode ? params.toString() : "");
    if (mailboxId) next.set("m", mailboxId);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    return `${pathname === "/dev/mail" ? pathname : "/mail"}?${next}`;
  }
  function compose() {
    const url = mailHref({ compose: "1" }, true);
    if (mailMode) router.replace(url, { scroll: false }); else router.push(url);
    setDrawer(false);
  }
  const commands: Command[] = [
    ...DESTINATIONS.map((route) => ({ id: route.href, label: route.label, group: "Routes", run: () => router.push(route.href) })),
    ...FOLDERS.map((folder) => ({ id: folder.key, label: folder.label, group: "Mail folders", run: () => router.push(mailHref({ folder: folder.key })) })),
    ...(overview?.mailboxes ?? []).map((mailbox) => ({ id: mailbox.id, label: mailbox.email, group: "Mailboxes", run: () => router.push(`/mail?m=${mailbox.id}`) })),
    { id: "compose", label: "New message", group: "Actions", keywords: "compose write", run: compose },
    { id: "theme", label: "Switch Night / Day", group: "Actions", keywords: "theme dark light", run: toggleTheme },
    { id: "help", label: "Keyboard shortcuts", group: "Actions", run: () => setHelp(true) },
    { id: "connect", label: "Connect a mailbox", group: "Actions", run: () => router.push("/settings/mailboxes/connect") },
  ];
  const sidebar = <Sidebar onCompose={compose} onNavigate={() => setDrawer(false)} />;
  return (
    <div className="signal-frame" data-mail={mailMode || undefined}>
      <div className="signal-desktop-sidebar">{mailMode ? <Sidebar compact onCompose={compose} onNavigate={() => setDrawer(true)} /> : sidebar}</div>
      <div className="signal-workspace">
        <Topbar mail={mailMode} onCompose={compose} onCommand={openPalette} onMenu={() => setDrawer(true)} />
        <main id="main-content" className="signal-canvas">
          {variant === "app" ? children : <div className="min-w-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-4xl p-5 sm:p-8">{children}</div></div>}
        </main>
      </div>
      <ShellDialog id="signal-drawer" open={drawer} onClose={() => setDrawer(false)} labelId="signal-drawer-title" className="signal-drawer">
        <h2 id="signal-drawer-title" className="sr-only">Navigation</h2>
        <Button className="signal-drawer-close" variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setDrawer(false)}><X size={18} /></Button>
        {sidebar}
      </ShellDialog>
      <CommandPalette key={paletteKey} open={palette} onClose={() => setPalette(false)} commands={commands}
        onSearch={(query) => router.push(mailHref({ q: query }))} />
      <ShellDialog open={help} onClose={() => setHelp(false)} labelId="signal-help-title" className="signal-help">
        <div className="flex items-center justify-between gap-4"><h2 id="signal-help-title">Keyboard shortcuts</h2><Button variant="ghost" size="icon" onClick={() => setHelp(false)} aria-label="Close shortcuts"><X size={18} /></Button></div>
        <dl>{[["Ctrl / Cmd K", "Commands"], ["j / k", "Next / previous thread"], ["r", "Reply"], ["c", "Compose"], ["e", "Archive thread or selection"], ["u", "Mark unread"], ["x", "Select thread"], ["/", "Search mail"], ["Esc", "Clear selection or close"], ["?", "This list"]].map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
      </ShellDialog>
    </div>
  );
}
