import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing use of the Kwetu Connect Advertising website and advertising services.",
  alternates: { canonical: "/terms" },
};

const sections = [
  {
    heading: "1. About these terms",
    body: "These terms govern your use of the Kwetu Connect Advertising website and your engagement of our LED billboard advertising services in Eldoret, Kenya. By submitting an inquiry or booking a campaign, you accept these terms.",
  },
  {
    heading: "2. Inquiries and quotations",
    body: "Submitting the contact form is an inquiry, not a binding booking. Space on the screen, pricing, and campaign schedules are confirmed in writing. Quotations are valid for the period stated on the quotation.",
  },
  {
    heading: "3. Advertising content",
    body: "Advertisers are responsible for ensuring their creative content is lawful, accurate, and compliant with applicable Kenyan advertising regulations. We reserve the right to decline or remove content that is unlawful, misleading, or that we consider inappropriate for public display. Restricted categories (including political and betting advertising) are subject to separate fixed-rate terms and regulatory requirements.",
  },
  {
    heading: "4. Scheduling and availability",
    body: "How often an advert plays and the number of plays describe the standard operation of our display. Temporary interruptions may occur due to power, maintenance, or events beyond our control; affected airtime is rescheduled or credited.",
  },
  {
    heading: "5. Payment",
    body: "Payment terms, including deposits and cancellation notice periods, are set out in your campaign agreement or invoice.",
  },
  {
    heading: "6. Intellectual property",
    body: "You retain rights to your creative material and grant us a licence to display it for the booked campaign. All website content, branding, and photography on this site belongs to Kwetu Connect Advertising.",
  },
  {
    heading: "7. Liability",
    body: "To the maximum extent permitted by law, our liability in connection with a campaign is limited to the amount paid for that campaign. Nothing in these terms excludes liability that cannot be excluded under Kenyan law.",
  },
  {
    heading: "8. Contact",
    body: "Questions about these terms: info@kwetuconnectads.co.ke or +254 729 911 021, P.O. Box 8698-30100, Eldoret, Kenya.",
  },
];

export default function TermsPage() {
  return (
    <section className="bg-white pt-[calc(88px+4rem)] pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <span className="section-label inline-block text-xs font-semibold text-brand-700 uppercase tracking-[0.15em] mb-5">
          Legal
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-[-0.02em] text-black mb-4">
          Terms of Service
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
          <Link href="/privacy" className="text-brand-700 font-semibold hover:text-brand-600">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
