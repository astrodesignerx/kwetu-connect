import { AppShell } from "@/components/app-shell";

// Drafts previously rendered with no navigation at all, so following the rail's
// "Drafts" link left you on a page with no way back to the inbox.
export default function DraftsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
