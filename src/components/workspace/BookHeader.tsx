import Image from "next/image";
import Link from "next/link";
import type { BookingSettings } from "@/lib/booking/settings";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import ThemeSwitch from "./ThemeSwitch";
import OnAir from "./OnAir";
export default function BookHeader({ settings, step = 1 }: { settings: BookingSettings; step?: number }) {
  return <header className="book-header"><Link href="/" aria-label="Kwetu Connect home" className="workspace-logo"><Image src="/logo-main.svg" width={120} height={40} alt="Kwetu Connect Advertising" className="logo-night" priority /><Image src="/logo-dark.svg" width={120} height={40} alt="Kwetu Connect Advertising" className="logo-day" priority /></Link><ol className="book-steps" aria-label="Booking steps">{["Choose", "Your details", "Pay and send advert"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}>{index + 1} {label}</li>)}</ol><div className="book-header-tools"><OnAir settings={settings} now={new Date().toISOString()} /><a className="quiet-button" href={"https://wa.me/" + WHATSAPP_NUMBER} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a><ThemeSwitch /><Link href="/" className="back-site">Back to site</Link></div></header>;
}
