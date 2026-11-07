import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono, DotGothic16 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { themeScript } from "@/components/shell/theme-init";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-display", display: "swap" });
const body = Geist({ subsets: ["latin"], variable: "--f-body", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });
const led = DotGothic16({ weight: "400", subsets: ["latin"], variable: "--f-led", display: "swap" });

export const metadata: Metadata = {
  title: "Kwetu OS",
  description: "Kwetu Connect Ads client communication platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${led.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
