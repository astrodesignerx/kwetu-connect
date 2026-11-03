import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { signOut } from "../auth-actions";
import ManagerNav from "@/components/manage/ManagerNav";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <>
    <header className="manager-header">
      <Link href="/manage" className="manager-wordmark">KCA MANAGE</Link><ManagerNav />
      <span className="manager-email">{staff.email}</span><form action={signOut}><button className="quiet-button">Sign out</button></form>
    </header><div className="manager-content">{children}</div>
  </>;
}
