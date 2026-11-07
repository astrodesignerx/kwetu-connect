import { AppShell } from "@/components/app-shell";

// The mail view owns its own scrolling: the thread list and the reader scroll
// independently, so the shell hands it the full viewport rather than wrapping it
// in a scrolling, width-capped container.
export default function MailLayout({ children }: { children: React.ReactNode }) {
  return <AppShell variant="app">{children}</AppShell>;
}
