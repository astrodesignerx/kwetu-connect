"use client";

import { useState, type ComponentType } from "react";
import { Eye, EyeOff, Loader2, type LucideProps } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/logo";

export function AuthCard({ title, subtitle, children, footer }: {
  title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode; welcome?: boolean;
}) {
  return (
    <main className="signal-auth">
      <section className="signal-auth-form">
        <div className="signal-auth-content">
          <div className="signal-auth-brand"><Logo /><span>Kwetu OS</span></div>
          <header className="signal-auth-heading"><h1>{title}</h1><p>{subtitle}</p></header>
          {children}
          {footer && <div className="signal-auth-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}

export function AuthField({ icon: Icon, label, id, hint, className, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { icon: ComponentType<LucideProps>; label: string; id: string; hint?: string }) {
  return <div className="signal-auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="signal-auth-input-wrap"><Icon aria-hidden size={16} />
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={cn("signal-auth-input", className)} {...props} />
    </div>
    {hint && <p id={`${id}-hint`}>{hint}</p>}
  </div>;
}

export function AuthPasswordField({ icon: Icon, label, id, hint, ...props }:
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { icon: ComponentType<LucideProps>; label: string; id: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="signal-auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="signal-auth-input-wrap"><Icon aria-hidden size={16} />
      <input id={id} type={visible ? "text" : "password"} className="signal-auth-input signal-password"
        aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      <button type="button" className="signal-password-toggle" onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
    {hint && <p id={`${id}-hint`}>{hint}</p>}
  </div>;
}

export function AuthSubmit({ busy, busyLabel, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy: boolean; busyLabel: string;
}) {
  return <button type="submit" disabled={busy} aria-busy={busy} className="signal-button btn-primary signal-auth-submit" {...props}>
    {busy ? <><Loader2 aria-hidden size={16} className="signal-loading" />{busyLabel}</> : children}
  </button>;
}

export function AuthError({ children }: { children?: React.ReactNode }) {
  return children ? <p role="alert" className="signal-auth-error">{children}</p> : null;
}
