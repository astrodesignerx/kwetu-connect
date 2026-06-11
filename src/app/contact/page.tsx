"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
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
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      <section className="relative py-28 lg:py-36 bg-black text-white overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(169,115,22,0.15),transparent_60%)] pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-5">
              Get In Touch
            </span>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-3xl font-extrabold leading-tight tracking-[-0.02em] mb-2">
              Let&apos;s put your brand
            </h1>
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-3xl font-extrabold leading-tight tracking-[-0.02em] mb-6 italic text-[#EDB347]">
              on the map.
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Ready to advertise? Fill in the form and the Kwetu Connect team
              will get back with a tailored package.
            </p>
          </div>
        </div>
      </section>

      <AnimatedSection className="pt-10 lg:pt-14 pb-20 lg:pb-24 bg-white relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">
            <AnimatedItem delay={1} className="lg:col-span-3 h-full">
              {submitted ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center h-full">
                  <svg
                    className="w-12 h-12 text-green-600 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
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
                      <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-1">
                        Inquiry Form
                      </span>
                      <h3 className="text-xl font-bold font-sans text-black">
                        Tell us about your campaign.
                      </h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[0.55rem] font-semibold text-gray-500 uppercase tracking-wider block">
                        Avg. Reply
                      </span>
                      <span className="text-xs font-bold text-[#EDB347]">
                        Within 1 Day
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="flex-1 flex flex-col">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                      <div>
                        <label htmlFor="fullName" className="block text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="fullName"
                          name="fullName"
                          type="text"
                          required
                          value={formData.fullName}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm focus:outline-none focus:border-[#A97316] focus:ring-3 focus:ring-[#A97316]/15 transition-colors placeholder:text-gray-400"
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <label htmlFor="company" className="block text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Company / Business <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="company"
                          name="company"
                          type="text"
                          required
                          value={formData.company}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm focus:outline-none focus:border-[#A97316] focus:ring-3 focus:ring-[#A97316]/15 transition-colors placeholder:text-gray-400"
                          placeholder="Your Business Ltd."
                        />
                      </div>
                      <div>
                        <label htmlFor="phone" className="block text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm focus:outline-none focus:border-[#A97316] focus:ring-3 focus:ring-[#A97316]/15 transition-colors placeholder:text-gray-400"
                          placeholder="+254 7XX XXX XXX"
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm focus:outline-none focus:border-[#A97316] focus:ring-3 focus:ring-[#A97316]/15 transition-colors placeholder:text-gray-400"
                          placeholder="info@example.com"
                        />
                      </div>
                    </div>

                    <div className="mb-5">
                      <span className="block text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Preferred Package
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {packages.map((pkg) => (
                          <button
                            key={pkg}
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, preferredPackage: pkg }))}
                            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors border ${
                              formData.preferredPackage === pkg
                                ? "bg-[#A97316] text-black border-[#A97316]"
                                : "bg-gray-100 text-gray-700 border-gray-200 hover:border-[#A97316]/50"
                            }`}
                          >
                            {pkg}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-6 flex-1">
                      <label htmlFor="campaignBrief" className="block text-[0.6rem] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                        Campaign Brief <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="campaignBrief"
                        name="campaignBrief"
                        required
                        rows={5}
                        value={formData.campaignBrief}
                        onChange={handleChange}
                        className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 text-sm focus:outline-none focus:border-[#A97316] focus:ring-3 focus:ring-[#A97316]/15 transition-colors placeholder:text-gray-400 resize-y"
                        placeholder="Tell us about your product, campaign goal, and preferred duration"
                      />
                    </div>

                    <button
                      type="submit"
                      className="group w-full px-8 py-3.5 rounded-full bg-[#EDB347] text-black font-bold text-sm tracking-wide hover:bg-[#f5c84d] transition-all duration-200"
                    >
                      Send Inquiry
                      <svg className="w-3.5 h-3.5 ml-1.5 inline group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </button>

                    <p className="text-[0.6rem] text-gray-500 mt-3 text-center">
                      By submitting, you agree to our privacy policy and terms of service.
                    </p>
                  </form>
                </div>
              )}
            </AnimatedItem>

            <AnimatedItem delay={2} className="lg:col-span-2 flex flex-col gap-6 h-full">
              <div className="rounded-2xl bg-[#EDB347] p-8">
                <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-4">
                  Direct Contact
                </span>
                <h3 className="text-xl font-semibold font-sans text-black mb-6">
                  Prefer to call or write?
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="text-[0.55rem] font-semibold text-[#A97316] uppercase tracking-wider flex-shrink-0 w-12">
                      Phone
                    </span>
                    <a
                      href="tel:+254757642224"
                      className="text-sm font-semibold font-sans text-black hover:underline no-underline"
                    >
                      +254 739 857 576
                    </a>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="text-[0.55rem] font-semibold text-[#A97316] uppercase tracking-wider flex-shrink-0 w-12">
                      Email
                    </span>
                    <a
                      href="mailto:info@kwetuconnectadvertising.co.ke"
                      className="text-sm font-semibold font-sans text-black hover:underline no-underline break-all"
                    >
                      info@kwetuconnectadvertising.co.ke
                    </a>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="text-[0.55rem] font-semibold text-[#A97316] uppercase tracking-wider flex-shrink-0 w-12">
                      Location
                    </span>
                    <span className="text-sm font-semibold font-sans text-black">
                      Eldoret, Kenya
                    </span>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="text-[0.55rem] font-semibold text-[#A97316] uppercase tracking-wider flex-shrink-0 w-12">
                      P.O Box
                    </span>
                    <span className="text-sm font-semibold font-sans text-black">
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
                  <span className="text-[0.5rem] font-semibold text-[#A97316] uppercase tracking-wider block">
                    Find Us
                  </span>
                  <span className="text-[0.65rem] text-gray-700 font-medium">
                    Kisumu Ndogo Rd, Langas Jct.
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
                <span className="section-label inline-block text-xs font-semibold text-[#A97316] uppercase tracking-[0.15em] mb-4">
                  Hours
                </span>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Mon &mdash; Fri</span>
                    <span className="text-sm font-semibold text-gray-900">8:00 &mdash; 18:00</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Saturday</span>
                    <span className="text-sm font-semibold text-gray-900">9:00 &mdash; 14:00</span>
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
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#A97316]/50 to-transparent" />
      </AnimatedSection>
    </>
  );
}
