import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Workspace from "@/components/workspace/Workspace";
// DM Sans is the manager's only typeface (2026-11-12). Loaded here so public pages never download it.
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
export const metadata: Metadata = { title: "KCA manager", robots: { index: false, follow: false }, alternates: { canonical: null } };
export const dynamic = "force-dynamic";
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <Workspace><div className={"manager-shell " + dmSans.variable}>
    <div className="manager-workspace">{children}</div>
  </div></Workspace>;
}
