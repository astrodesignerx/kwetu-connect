import type { Metadata } from "next";
import { Bricolage_Grotesque, DotGothic16, Geist, Geist_Mono } from "next/font/google";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-display" });
const body = Geist({ subsets: ["latin"], variable: "--f-body" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono" });
const led = DotGothic16({ weight: "400", subsets: ["latin"], variable: "--f-led" });

export const metadata: Metadata = {
  title: "Signal components / Development / Kwetu OS",
  robots: { index: false, follow: false },
};

export default function SignalDemoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${body.variable} ${mono.variable} ${led.variable}`}>{children}</div>;
}
