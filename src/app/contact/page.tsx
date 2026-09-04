"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";

const packages = [
  "Platinum / Prime",
  "Premium",
  "Standard",
  "Basic",
  "Not Sure",
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    company: "",
    phone: "",
    email: "",
    campaignBrief: "",
    preferredPackage: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Honeypot: a hidden field real users never see. Pass it to the server,
    // which silently accepts bot-filled submissions without sending anything.
    const honeypot = (
      e.currentTarget.elements.namedItem("botcheck") as HTMLInputElement | null
    )?.value;

    setStatus("sending");
    setErrorMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          botcheck: honeypot || "",
          fullName: formData.fullName,
          company: formData.company,
          phone: formData.phone,
          email: formData.email,
          preferredPackage: formData.preferredPackage || "Not specified",
          campaignBrief: formData.campaignBrief,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("sent");
      } else {
        throw new Error(data.message || "Submission failed");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error && err.message !== "Submission failed"
          ? err.message
          : "Something went wrong sending your inquiry. Please try again, or email info@kwetuconnectads.co.ke."
      );
    }
  };

  return (
    <>
      <section className="relative py-[calc(7rem+30px)] lg:py-[calc(9rem+30px)] bg-ink text-white overflow-hidden">
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-cover bg-center hero-bg" style={{ backgroundImage: "url('/images/hero-city.webp')" }} />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Get In Touch
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              Ready to get
              <br />
              on screen?
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Fill in the form and we&apos;ll respond within one business day.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-20 lg:py-24 bg-white relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">
            <AnimatedItem delay={1} className="lg:col-span-3 h-full">
              {status === "sent" ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center h-full">
                  <CheckCircle size={48} weight="regular" className="text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-green-900 mb-2">
                    Inquiry Sent!
                  </h3>
                  <p className="text-sm text-green-700">
                    Thank you for reaching out. The Kwetu Connect team will
                    contact you within 24 hours with a tailored package.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 lg:p-10 h-full flex flex-col">
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h3 className="text-xl font-bold font-sans text-black">
                        Tell us about your campaign.
                      </h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider block">
                        Avg. Reply
                      </span>
                      <span className="text-xs font-bold text-brand-500">
                        Within 1 Day
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                    {/* Honeypot — hidden from real users, catches spam bots. */}
                    <input
                      type="text"
                      name="botcheck"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      className="hidden"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                      <div>
                        <label htmlFor="fullName" className="block text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="fullName"
                          name="fullName"
                          type="text"
                          required
                          value={formData.fullName}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-base sm:text-sm focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 transition-colors placeholder:text-gray-400"
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <label htmlFor="company" className="block text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Company / Business <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="company"
                          name="company"
                          type="text"
                          required
                          value={formData.company}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-base sm:text-sm focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 transition-colors placeholder:text-gray-400"
                          placeholder="Your Business Ltd."
                        />
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-base sm:text-sm focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 transition-colors placeholder:text-gray-400"
                          placeholder="+254 7XX XXX XXX"
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-base sm:text-sm focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 transition-colors placeholder:text-gray-400"
                          placeholder="info@example.com"
                        />
                      </div>
                    </div>

                    <div className="mb-5">
                      <span id="package-label" className="block text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Preferred Package
                      </span>
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="package-label">
                        {packages.map((pkg) => (
                          <button
                            key={pkg}
                            type="button"
                            aria-pressed={formData.preferredPackage === pkg}
                            onClick={() => setFormData((prev) => ({ ...prev, preferredPackage: pkg }))}
                            className={`px-4 py-2.5 rounded-full text-xs font-semibold transition-colors border ${
                              formData.preferredPackage === pkg
                                ? "bg-brand-500 text-black border-brand-500"
                                : "bg-gray-100 text-gray-700 border-gray-200 hover:border-brand-500 hover:bg-brand-500/15"
                            }`}
                          >
                            {pkg}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-6 flex-1">
                      <label htmlFor="campaignBrief" className="block text-[0.6875rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Campaign Brief <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="campaignBrief"
                        name="campaignBrief"
                        required
                        rows={5}
                        value={formData.campaignBrief}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-base sm:text-sm focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 transition-colors placeholder:text-gray-400 resize-y"
                        placeholder="Tell us about your product, campaign goal, and preferred duration"
                      />
                    </div>

                    {status === "error" && (
                      <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                        {errorMessage}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={status === "sending"}
                      className="group btn-sweep w-full px-6 py-3 rounded-full bg-brand-500 text-black font-semibold text-sm tracking-wide transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {status === "sending" ? "Sending…" : "Send Inquiry"}
                      <ArrowRight size={14} className="ml-1.5 inline group-hover:translate-x-0.5 transition-transform duration-200" />
                    </button>

                    <p className="text-[0.6875rem] text-gray-500 mt-3 text-center">
                      By submitting, you agree to our{" "}
                      <Link href="/privacy" className="text-brand-700 font-semibold hover:text-brand-600">
                        privacy policy
                      </Link>{" "}
                      and{" "}
                      <Link href="/terms" className="text-brand-700 font-semibold hover:text-brand-600">
                        terms of service
                      </Link>
                      .
                    </p>
                  </form>
                </div>
              )}
            </AnimatedItem>

            <AnimatedItem delay={2} className="lg:col-span-2 flex flex-col gap-6 h-full">
              <div className="rounded-2xl bg-black p-8">
                <h3 className="text-xl font-semibold font-sans text-white mb-6">
                  Prefer to call or write?
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href="tel:+254729911021"
                                        className="rounded-xl bg-white/[0.08] p-4 no-underline hover:bg-brand-500 hover:shadow-[0_0_12px_rgba(237,179,71,0.4)] transition-all duration-500 group"
                  >
                    <span className="text-[0.6875rem] font-semibold text-brand-500 group-hover:text-white uppercase tracking-wider block mb-1">
                      Phone
                    </span>
                    <span className="text-sm font-semibold font-sans text-white group-hover:text-black">
                      +254 729 911 021
                    </span>
                  </a>
                  <a
                    href="mailto:info@kwetuconnectads.co.ke"
                                        className="rounded-xl bg-white/[0.08] p-4 no-underline hover:bg-brand-500 hover:shadow-[0_0_12px_rgba(237,179,71,0.4)] transition-all duration-500 group"
                  >
                    <span className="text-[0.6875rem] font-semibold text-brand-500 group-hover:text-white uppercase tracking-wider block mb-1">
                      Email
                    </span>
                    <span className="text-sm font-semibold font-sans text-white group-hover:text-black break-all">
                      info@kwetuconnectads.co.ke
                    </span>
                  </a>
                  <div className="rounded-xl bg-white/[0.08] p-4 hover:bg-brand-500 hover:shadow-[0_0_12px_rgba(237,179,71,0.4)] transition-all duration-500 group">
                    <span className="text-[0.6875rem] font-semibold text-brand-500 group-hover:text-white uppercase tracking-wider block mb-1">
                      Location
                    </span>
                    <span className="text-sm font-semibold font-sans text-white group-hover:text-black">
                      Eldoret, Kenya
                    </span>
                  </div>
                  <div className="rounded-xl bg-white/[0.08] p-4 hover:bg-brand-500 hover:shadow-[0_0_12px_rgba(237,179,71,0.4)] transition-all duration-500 group">
                    <span className="text-[0.6875rem] font-semibold text-brand-500 group-hover:text-white uppercase tracking-wider block mb-1">
                      P.O Box
                    </span>
                    <span className="text-sm font-semibold font-sans text-white group-hover:text-black">
                      8698-30100, Eldoret
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-gray-200 flex-1 min-h-[200px]">
                <iframe
                  title="Kwetu Connect Location"
                  width="100%"
                  height="100%"
                  style={{ border: 0, position: "absolute", inset: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src="https://maps.google.com/maps?q=0.4813143,35.2649463&z=16&output=embed"
                  allowFullScreen
                />
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-200 shadow-sm">
                  <span className="text-[0.6875rem] text-gray-700 font-medium">
                    Kisumu Ndogo Rd, Langas Jct.
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Mon - Fri</span>
                    <span className="text-sm font-semibold text-gray-900">8:00 - 18:00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Saturday</span>
                    <span className="text-sm font-semibold text-gray-900">9:00 - 14:00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Sunday</span>
                    <span className="text-sm font-semibold text-gray-900">By appointment</span>
                  </div>
                </div>
              </div>
            </AnimatedItem>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-600/30 to-transparent" />
      </AnimatedSection>
    </>
  );
}
