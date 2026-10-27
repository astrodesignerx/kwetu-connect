import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { signOut } from "../auth-actions";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <>
    <header className="mb-8 space-y-4 border-b border-white/15 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/manage" className="text-xl font-bold text-brand-500">KCA manager</Link><span className="break-all text-sm text-gray-300">{staff.email}</span></div>
      <nav aria-label="Manager" className="flex flex-wrap items-center gap-4 text-sm"><Link className="staff-link" href="/manage">Bookings</Link><Link className="staff-link" href="/manage/settings">Settings</Link><Link className="staff-link" href="/manage/schedule">Schedule</Link><form action={signOut}><button className="staff-link">Sign out</button></form></nav>
    </header>{children}
  </>;
}
