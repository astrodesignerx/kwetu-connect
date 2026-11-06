"use client";
import { useActionState, useState } from "react";
import { ArrowRight, EnvelopeSimple, Key, PaperPlaneTilt } from "@phosphor-icons/react";
import { emailLinks, openBooking } from "@/app/book/actions";

/** Two ways back to a booking from a new device: the reference plus phone, or an email with every link. */
export default function FindBooking() {
  const [found, find, finding] = useActionState(openBooking, { error: "" });
  const [mail, send, sending] = useActionState(emailLinks, { error: "" });
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  return <div className="find-wrap">
    <header className="find-head">
      <p className="quote-eyebrow">FIND YOUR BOOKING</p>
      <h1>Pick up where you left off.</h1>
      <p>Your booking link opens it on any device. Lost it? Use one of these.</p>
    </header>
    <div className="find-grid">
      <form action={find} className="find-card">
        <span className="find-icon" aria-hidden="true"><Key size={20} weight="bold" /></span>
        <h2>Reference and phone</h2>
        <p>The reference starts with KCA-. It is in your WhatsApp message and email.</p>
        <label>Booking reference<input name="reference" required autoComplete="off" spellCheck={false} placeholder="KCA-..." maxLength={40} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
        <label>Phone you booked with<input name="phone" type="tel" required autoComplete="tel" maxLength={30} placeholder="0712 345 678" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <p aria-live="polite" className="find-error">{found.error}</p>
        <button className="pay-button" disabled={finding}>{finding ? "Opening..." : <>Open my booking<ArrowRight size={16} weight="bold" aria-hidden="true" /></>}</button>
      </form>
      <form action={send} className="find-card" style={{ animationDelay: "70ms" }}>
        <span className="find-icon" aria-hidden="true"><EnvelopeSimple size={20} weight="bold" /></span>
        <h2>Email me my links</h2>
        <p>If you gave an email when you booked, we send links to your 10 most recent open bookings.</p>
        <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} placeholder="you@business.co.ke" /></label>
        {mail.sent ? <p className="find-sent" role="status"><PaperPlaneTilt size={16} weight="bold" aria-hidden="true" />If that email has bookings, the links are on their way. Check spam too.</p>
          : <p aria-live="polite" className="find-error">{mail.error}</p>}
        <button className="pay-ghost" disabled={sending || mail.sent}>{sending ? "Sending..." : mail.sent ? "Sent" : "Send my links"}</button>
      </form>
    </div>
  </div>;
}
