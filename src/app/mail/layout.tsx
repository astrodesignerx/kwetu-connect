import { requireStaff } from "@/lib/auth/server";
import { Archivo, Geist_Mono } from "next/font/google";
import "./mail.css";

export const metadata = { title: "Staff mail", robots: { index: false, follow: false } };
export const maxDuration = 60;
const archivo = Archivo({ subsets: ["latin"], variable: "--mail-archivo", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--mail-geist-mono", display: "swap" });

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  await requireStaff("/mail");
  return <div className={`mail-app ${archivo.variable} ${mono.variable}`}>{children}</div>;
}
