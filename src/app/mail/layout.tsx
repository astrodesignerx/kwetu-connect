import { cookies } from "next/headers";
import { MailAppearance } from "@/components/mail/MailTheme";
import { Archivo, Geist_Mono } from "next/font/google";
import "./mail.css";

export const metadata = { title: "Staff mail", robots: { index: false, follow: false } };
export const maxDuration = 60;
const archivo = Archivo({ subsets: ["latin"], variable: "--mail-archivo", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--mail-geist-mono", display: "swap" });

// No sign-in check here: layouts do not re-run on navigation, and /mail/sign-in lives under this layout.
// Every /mail page, server action and route handler calls requireStaff itself.
export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const initialGraphite = (await cookies()).get("kca-mail-theme")?.value === "graphite";
  return <MailAppearance className={`mail-app ${archivo.variable} ${mono.variable}`} initialGraphite={initialGraphite}>{children}</MailAppearance>;
}
