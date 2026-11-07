import { AppShell } from "@/components/app-shell";

// Settings used to carry a second, near-duplicate sidebar listing a different set of
// destinations than the mail one — two chromes and two vocabularies for one app. Its
// links now live in the shared rail under Library, Account and Admin.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
