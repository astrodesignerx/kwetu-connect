import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { signOut } from "../auth-actions";
import ManagerTopbar from "@/components/manage/ManagerTopbar";
import ManagerPageIntro from "@/components/manage/ManagerPageIntro";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const store = getStore();
  const bookings = await store.listBookings();
  const details = await Promise.all(bookings.filter((booking) => !["Finished", "Cancelled"].includes(booking.status)).map((booking) => store.bookingDetail(booking.reference)));
  const adverts = details.reduce((count, detail) => count + (detail?.adverts.filter((advert) => advert.decision === "waiting").length ?? 0), 0);
  const now = new Date().toISOString();
  return <div className="manager-app">
    <ManagerTopbar adverts={adverts} bookings={bookings.filter((booking) => booking.status !== "Cancelled").length} email={staff.email} signOut={signOut} />
    <div className="manager-main"><ManagerPageIntro now={now} /><div className="manager-content">{children}</div></div>
  </div>;
}
