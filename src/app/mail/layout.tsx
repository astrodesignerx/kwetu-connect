import { requireStaff } from "@/lib/auth/server";
import "./mail.css";

export const metadata = { title: "Staff mail", robots: { index: false, follow: false } };
export const maxDuration = 60;

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  await requireStaff("/mail");
  return <div className="mail-app">{children}</div>;
}
