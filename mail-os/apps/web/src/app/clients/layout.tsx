import { AppShell } from "@/components/app-shell";

// As with drafts, the client workspace had no navigation of its own.
export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
