import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | Book Plays on Our LED Billboard",
  description:
    "Book LED billboard advertising in Eldoret. Call +254 729 911 021, email info@kwetuconnectads.co.ke, or send your campaign brief and get a plan that fits within 24 hours.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
