import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import PublicChrome from "@/components/PublicChrome";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import SmoothScroll from "@/components/SmoothScroll";
import PixelWaveButtons from "@/components/PixelWaveButtons";
import "./globals.css";

const archivo = localFont({
  variable: "--font-archivo",
  src: [
    { path: "../../public/fonts/archivo/archivo-latin-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../public/fonts/archivo/archivo-latin-italic.woff2", weight: "100 900", style: "italic" },
  ],
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  display: "swap",
});

const siteUrl = "https://kwetuconnectads.co.ke";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Kwetu Connect Advertising | LED Billboard Advertising in Eldoret",
    template: "%s | Kwetu Connect Advertising",
  },
  description:
    "Eldoret's premier LED billboard advertising platform. Put your brand where it can't be ignored. Connecting Brands to Community.",
  keywords: [
    "LED billboard",
    "advertising",
    "Eldoret",
    "digital signage",
    "outdoor advertising",
    "Kenya",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Kwetu Connect Advertising",
    title: "Kwetu Connect Advertising | LED Billboard Advertising in Eldoret",
    description:
      "Eldoret's premier LED billboard advertising platform. Put your brand where it can't be ignored.",
    locale: "en_KE",
    images: [
      {
        url: "/images/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Kwetu Connect LED billboard in Eldoret",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kwetu Connect Advertising | LED Billboard Advertising in Eldoret",
    description:
      "Eldoret's premier LED billboard advertising platform. Put your brand where it can't be ignored.",
    images: ["/images/og-image.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Kwetu Connect Advertising",
  description:
    "LED billboard advertising in Eldoret, Kenya. Digital outdoor advertising on Kisumu Ndogo Road near Langas Junction.",
  url: siteUrl,
  telephone: "+254729911021",
  email: "info@kwetuconnectads.co.ke",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Kisumu Ndogo Road, Near Langas Junction",
    addressLocality: "Eldoret",
    postalCode: "30100",
    addressCountry: "KE",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 0.4813143,
    longitude: 35.2649463,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "08:00",
      closes: "18:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Saturday",
      opens: "09:00",
      closes: "14:00",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${archivo.variable} h-full`}>
      <body className="bg-ink min-h-full flex flex-col font-sans">
        {/* Marks JS availability before first paint so reveal animations
            only hide content when they can actually reveal it again. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
        />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
        >
          Skip to content
        </a>
        <PublicChrome><SmoothScroll /><PixelWaveButtons /><Navbar /></PublicChrome>
        <main id="main-content" className="flex-1 -mt-[88px]">{children}</main>
        <PublicChrome><Footer /><FloatingButtons /></PublicChrome>
      </body>
    </html>
  );
}
