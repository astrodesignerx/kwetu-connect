"use client";
import { useState } from "react";
import { MPESA_PAYBILL, WHATSAPP_NUMBER } from "@/lib/contact";

const number = (value: number) => value.toLocaleString("en-GB");
const whatsapp = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
// M-Pesa confirmation codes are 10 letters and digits, for example SKL4X9P2QA.
const CODE = /^[A-Z0-9]{10}$/;

/** M-Pesa wants a short account; the first 12 characters of the reference are unique enough and staff search matches them. */
export const payAccount = (reference: string) => reference.slice(0, 12);

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1600); } catch { /* the value stays visible to type by hand */ }
  }
  return <div className="pay-copy">
    <div><small>{label}</small><b>{value}</b></div>
    <button type="button" onClick={copy} data-done={done} aria-label={`Copy ${label.toLowerCase()}`}>{done ? "Copied" : "Copy"}</button>
  </div>;
}

/** Concept B "Pay first" (2026-11-05): amount due, M-Pesa or card, numbered steps, and the code sent to KCA on WhatsApp. */
export default function PayPanel({ reference, priceKes, link }: { reference: string; priceKes: number; link: string }) {
  const [method, setMethod] = useState<"mpesa" | "card">("mpesa");
  const [code, setCode] = useState("");
  const account = payAccount(reference);
  const clean = code.trim().toUpperCase();
  const valid = CODE.test(clean);
  const paidMessage = `Hello KCA, I have paid KES ${number(priceKes)} for booking ${reference}. M-Pesa code: ${clean}
Booking page: ${link}`;
  const cardMessage = `Hello KCA, please send me a card payment link for booking ${reference} (KES ${number(priceKes)}).
Booking page: ${link}`;
  return <div className="pay-panel">
    <div className="pay-due">
      <div><p className="quote-eyebrow">AMOUNT DUE</p><p className="pay-amount"><span>KES</span>{number(priceKes)}</p></div>
      <span className="pay-chip">Step 1 of 3</span>
    </div>
    <div className="pay-methods" role="radiogroup" aria-label="How you pay">
      <button type="button" role="radio" aria-checked={method === "mpesa"} onClick={() => setMethod("mpesa")}><b>M-Pesa</b><small>Paybill, your booking reference is the account</small></button>
      <button type="button" role="radio" aria-checked={method === "card"} onClick={() => setMethod("card")}><b>Card</b><small>Visa or Mastercard, KCA sends a link</small></button>
    </div>
    {method === "mpesa" ? <div className="pay-body" key="mpesa">
      <ol className="pay-steps">
        <li><span>Open M-Pesa, then Lipa na M-Pesa, then Paybill.</span></li>
        <li><span>{MPESA_PAYBILL ? <>Business number <b>{MPESA_PAYBILL}</b>, account <b>{account}</b>.</> : <>Ask KCA on WhatsApp for the business number. Use account <b>{account}</b>.</>}</span></li>
        <li><span>Pay <b>KES {number(priceKes)}</b>, then send us the code from your M-Pesa message.</span></li>
      </ol>
      <div className="pay-copies">
        {MPESA_PAYBILL && <CopyRow label="Business number" value={MPESA_PAYBILL} />}
        <CopyRow label="Account" value={account} />
      </div>
      <label className="pay-code">
        <small>M-Pesa code</small>
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. SKL4X9P2QA" maxLength={12} autoComplete="off" spellCheck={false} aria-invalid={code !== "" && !valid} />
      </label>
      {valid ? <a className="pay-button" href={whatsapp(paidMessage)} target="_blank" rel="noopener noreferrer">Confirm payment</a>
        : <span className="pay-button" aria-disabled="true">Confirm payment</span>}
      <p className="pay-hint">{code !== "" && !valid ? "An M-Pesa code is 10 letters and numbers." : "This opens WhatsApp with your code. KCA confirms within 1 working day."}</p>
    </div> : <div className="pay-body" key="card">
      <ol className="pay-steps">
        <li><span>Ask KCA for a card payment link on WhatsApp.</span></li>
        <li><span>Pay <b>KES {number(priceKes)}</b> by Visa or Mastercard on the secure page.</span></li>
        <li><span>KCA marks your booking paid within 1 working day.</span></li>
      </ol>
      <a className="pay-button" href={whatsapp(cardMessage)} target="_blank" rel="noopener noreferrer">Ask for a card link</a>
    </div>}
  </div>;
}
