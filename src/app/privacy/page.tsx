import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Kwetu Connect Advertising collects, uses, and protects your personal information.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  {
    heading: "1. Who we are",
    body: "Kwetu Connect Advertising (“Kwetu Connect”, “we”, “us”) operates LED billboard advertising services in Eldoret, Kenya. Our registered contact is P.O. Box 8698-30100, Eldoret, Kenya — info@kwetuconnectads.co.ke.",
  },
  {
    heading: "2. What we collect",
    body: "When you submit our contact form or reach us by phone, email, or WhatsApp, we collect the details you provide: your name, company, phone number, email address, and the contents of your campaign brief. Our website does not require accounts and does not collect payment information online.",
  },
  {
    heading: "3. How we use your information",
    body: "We use your details solely to respond to your inquiry, prepare advertising proposals, and manage campaigns you book with us. We do not sell or rent your personal information to third parties, and we do not use it for unrelated marketing without your consent.",
  },
  {
    heading: "4. Legal basis and your rights",
    body: "We process personal data in accordance with the Data Protection Act, 2019 (Kenya). You have the right to access the personal data we hold about you, request correction or deletion, and object to processing. To exercise any of these rights, email info@kwetuconnectads.co.ke.",
  },
  {
    heading: "5. Retention",
    body: "We keep inquiry details only as long as needed to handle your request and any resulting business relationship, after which they are deleted.",
  },
  {
    heading: "6. Third-party services",
    body: "Our contact page embeds a Google Maps view, and our contact form is delivered through a form-processing service. These providers receive only the data necessary to render the map or deliver your message, and are governed by their own privacy policies.",
  },
  {
    heading: "7. Changes and contact",
    body: "We may update this policy from time to time; the latest version will always be published on this page. Questions? Contact info@kwetuconnectads.co.ke or +254 729 911 021.",
  },
];

export default function PrivacyPage() {
  return (
    <section className="bg-white pt-[calc(88px+4rem)] pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <span className="section-label inline-block text-xs font-semibold text-[#8a5e12] uppercase tracking-[0.15em] mb-5">
          Legal
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-[-0.02em] text-black mb-4">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-500 mb-12">Last updated: July 2026</p>
        <div className="space-y-10">
          {sections.map((s) => (
            <div key={s.heading}>
              <h2 className="text-xl font-bold text-black mb-3">{s.heading}</h2>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 mt-12">
          See also our{" "}
          <Link href="/terms" className="text-[#8a5e12] font-semibold hover:text-[#A97316]">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
