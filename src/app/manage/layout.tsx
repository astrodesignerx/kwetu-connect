import type { Metadata } from "next";
import Workspace from "@/components/workspace/Workspace";
export const metadata: Metadata = { title: "KCA manager", robots: { index: false, follow: false }, alternates: { canonical: null } };
export const dynamic = "force-dynamic";
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <Workspace><div className="manager-shell">
    <div className="manager-workspace">{children}</div>
  </div></Workspace>;
}
