import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { nairobiClock } from "@/lib/dashboard";
import { signOut } from "../auth-actions";
import ManagerNav from "@/components/manage/ManagerNav";
import ManagerTopbar from "@/components/manage/ManagerTopbar";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const store = getStore();
  const bookings = await store.listBookings();
  const details = await Promise.all(bookings.filter((booking) => !["Finished", "Cancelled"].includes(booking.status)).map((booking) => store.bookingDetail(booking.reference)));
  const adverts = details.reduce((count, detail) => count + (detail?.adverts.filter((advert) => advert.decision === "waiting").length ?? 0), 0);
  const now = new Date();
  const hour = nairobiClock(now).hour;
  const name = staff.email.split("@")[0];
  const initials = name.slice(0, 2).toUpperCase();
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
  return <div className="manager-app"><aside className="manager-rail"><Link href="/manage" className="rail-logo" aria-label="KCA manager">K</Link><ManagerNav adverts={adverts} /><div className="rail-account"><span title={staff.email}>{initials}</span><form action={signOut}><button aria-label="Sign out" title="Sign out">Exit</button></form></div></aside><div className="manager-main"><ManagerTopbar greeting={"Good " + (hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening") + ", " + name} date={date} /><div className="manager-content">{children}</div></div></div>;
}
