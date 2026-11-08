import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { themeScript } from "@/components/shell/theme-init";

const body = Geist({ subsets: ["latin"], variable: "--f-body", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

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
    <html lang="en" className={`${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
