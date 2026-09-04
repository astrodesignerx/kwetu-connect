"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";

export default function Footer({ showCTA = true }: { showCTA?: boolean }) {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const shouldShowCTA = showCTA && pathname !== "/billboard" && pathname !== "/contact";

  return (
    <footer>
      {shouldShowCTA && (
        <section className="bg-brand-400 py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-base md:text-xl font-bold font-sans text-black text-center md:text-left">
              Limited slots available - book your space today.
            </p>
            <Link
              href="/contact"
              className="group btn-sweep flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-ink text-white text-sm font-semibold whitespace-nowrap transition-all duration-200 no-underline"
            >
              Get In Touch
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
            </Link>
          </div>
        </section>
      )}

      <div className="bg-ink py-[60px]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-9 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-3 lg:col-start-1">
            <div className="flex items-start gap-3">
              <Image src="/logo-main.svg" alt="Kwetu Connect Advertising" width={154} height={47} className="h-[47.25px] w-auto" />
            </div>
            <p className="text-base md:text-lg font-bold text-white mt-6 leading-[1.15] tracking-tight font-sans">
              Local Focus.{" "}
              <span className="text-brand-400">Global Reach.</span>
            </p>
            <p className="text-sm text-gray-400 mt-4 max-w-xs">
              Eldoret&apos;s premier LED billboard advertising platform -
              putting brands where they can&apos;t be ignored.
            </p>
          </div>

          <div className="lg:col-span-2 lg:col-start-4">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Quick Links
            </span>
            <nav className="flex flex-col gap-4">
              {[
                { label: "About", href: "/about" },
                { label: "Services", href: "/services" },
                { label: "Billboard", href: "/billboard" },
                { label: "Contact", href: "/contact" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="link-underline w-fit py-2 -my-2 text-white text-sm hover:text-brand-400 transition-colors no-underline"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="lg:col-span-2 lg:col-start-6">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Contact
            </span>
            <div className="flex flex-col gap-4">
              <a
                href="tel:+254729911021"
                className="link-underline w-fit py-2 -my-2 text-white text-sm hover:text-brand-400 transition-colors no-underline"
              >
                +254 729 911 021
              </a>
              <a
                href="mailto:info@kwetuconnectads.co.ke"
                className="link-underline w-fit py-2 -my-2 text-white text-sm hover:text-brand-400 transition-colors no-underline"
              >
                info@kwetuconnectads.co.ke
              </a>
              <span className="text-white text-sm">Eldoret, Kenya</span>
              <span className="text-white text-sm">P.O Box 8698-30100</span>
            </div>
          </div>

          <div className="lg:col-span-2 lg:col-start-8">
            <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
              Location
            </span>
            <div className="flex flex-col gap-4 text-white text-sm">
              <span>Kisumu Ndogo Rd</span>
              <span>Near Langas Junction</span>
              <span>Eldoret, Kenya</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-ink border-t border-[#2A2A2A] py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <p className="text-[0.75rem] sm:text-xs text-gray-400 uppercase tracking-wider text-center sm:text-left">
            &copy; {year} Kwetu Connect Advertising.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="link-underline py-2 -my-2 text-[0.75rem] sm:text-xs text-gray-400 hover:text-brand-400 uppercase tracking-wider no-underline transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="link-underline py-2 -my-2 text-[0.75rem] sm:text-xs text-gray-400 hover:text-brand-400 uppercase tracking-wider no-underline transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
