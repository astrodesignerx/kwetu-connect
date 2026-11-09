"use client";

import { Bell, Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { ThemeToggle } from "@/components/shell/theme";
import { useToast } from "@/components/shell/toast";
import { useMailHubStatus } from "@/lib/signalr";

export function Topbar({ onCommand = () => {}, onMenu = () => {}, onCompose, mail = false, primaryCompose = false }: {
  onCommand?: () => void; onMenu?: () => void; onCompose?: () => void; mail?: boolean; primaryCompose?: boolean;
} = {}) {
  const status = useMailHubStatus();
  const toast = useToast();
  const healthy = status === "connected";
  const label = healthy ? "Live mail updates connected" : status === "failed"
    ? "Live updates offline. Refresh to fetch the latest mail." : status === "idle"
    ? "No live mailbox connection" : "Connecting live mail updates";
  return (
    <header className="signal-topbar">
      <Button variant="ghost" size="icon" className="signal-menu" onClick={onMenu}
        aria-label="Open navigation" aria-haspopup="dialog" aria-controls="signal-drawer"><Menu size={18} /></Button>
      <button className="signal-command-trigger" onClick={onCommand} aria-haspopup="dialog">
        <Search size={16} aria-hidden /><span>Search mail and clients</span><kbd>{mail ? "/" : "Ctrl K"}</kbd>
      </button>
      <div className="signal-topbar-tools">
        <span className="signal-sync" data-state={healthy ? "healthy" : status === "failed" ? "error" : "waiting"}
          role="img" aria-label={label} title={label} />
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Notifications" title="Notifications"
          onClick={() => toast("Notifications are not available yet. New mail appears in Mail.")}><Bell size={18} /></Button>
      </div>
      <Button variant={primaryCompose ? "primary" : "default"} className="mail-new-email" onClick={onCompose}><Plus size={16} aria-hidden /><span>New email</span></Button>
    </header>
  );
}
