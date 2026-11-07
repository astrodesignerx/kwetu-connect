import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarBlank, Receipt, UserCircle, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import type { BookingSettings } from "@/lib/booking/settings";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import ThemeSwitch from "./ThemeSwitch";
import OnAir from "./OnAir";
import { MyBookings } from "@/components/booking/SavedBookings";
const STEPS = [{ label: "Choose your plays", Icon: CalendarBlank }, { label: "Your details", Icon: UserCircle }, { label: "Pay", Icon: Receipt }];
// Top bar, concept C with B's on-air chip (2026-11-05): icon steps where only the current step shows its label.
export default function BookHeader({ settings, step = 1 }: { settings: BookingSettings; step?: number }) {
  return <header className="book-header">
    <Link href="/" aria-label="Kwetu Connect home" className="workspace-logo"><Image src="/logo-main.svg" width={120} height={40} alt="Kwetu Connect Advertising" className="logo-night" priority /><Image src="/logo-dark.svg" width={120} height={40} alt="Kwetu Connect Advertising" className="logo-day" priority /></Link>
    <ol className="book-steps is-icons" aria-label="Booking steps">{STEPS.map(({ label, Icon }, index) => {
      const n = index + 1;
      return <li key={label} aria-current={step === n ? "step" : undefined} data-done={n < step} title={n + " " + label}>
        <span className="v2-step-number" aria-hidden="true">{n}</span><Icon className="sr-only" size={17} weight={step === n ? "bold" : "regular"} aria-hidden="true" /><span className="step-label">{label}</span><span className="sr-only">{"Step " + n + (step === n ? "" : ", " + label) + (n < step ? ", done" : "")}</span>
      </li>;
    })}</ol>
    <div className="book-header-tools">
      <MyBookings />
      <OnAir settings={settings} now={new Date().toISOString()} variant="chip" />
      <a className="header-icon is-whatsapp" href={"https://wa.me/" + WHATSAPP_NUMBER} target="_blank" rel="noopener noreferrer" aria-label="Ask on WhatsApp" title="Ask on WhatsApp"><WhatsappLogo size={17} weight="fill" aria-hidden="true" /></a>
      <ThemeSwitch variant="icons" />
      <Link href="/" className="back-site-button">Back to site<ArrowUpRight size={14} aria-hidden="true" /></Link>
    </div>
  </header>;
}
