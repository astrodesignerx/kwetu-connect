import type { Metadata } from "next";
import { isMemoryMode } from "@/lib/store";
export const metadata: Metadata = { title: "KCA manager", robots: { index: false, follow: false }, alternates: { canonical: null } };
export const dynamic = "force-dynamic";
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <div className="manager-shell">
    <div className="manager-workspace">{isMemoryMode() && <p className="demo-notice">Demo data, nothing is saved</p>}{children}</div>
  </div>;
}
