import type { Metadata } from "next";
import { isMemoryMode } from "@/lib/store";
export const metadata: Metadata = { title: "KCA manager", robots: { index: false, follow: false }, alternates: { canonical: null } };
export const dynamic = "force-dynamic";
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <div className="manager-shell min-h-screen bg-ink px-4 pb-12 pt-28 text-gray-100 sm:px-6">
    <div className="mx-auto max-w-6xl">{isMemoryMode() && <p className="mb-4 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-sm text-brand-200">Demo data, nothing is saved</p>}{children}</div>
  </div>;
}
