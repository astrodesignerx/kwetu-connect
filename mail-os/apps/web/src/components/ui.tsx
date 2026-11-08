import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "default" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "default" | "small" | "icon" }) {
  const styles: Record<ButtonVariant, string> = {
    primary: "btn-primary",
    default: "btn-default",
    ghost: "btn-ghost",
    danger: "btn-danger",
  };
  return <button className={cn("signal-button", styles[variant], `signal-button-${size}`, className)} {...props} />;
}

export function Chip({ dot = false, hue, className, style, ...props }: React.HTMLAttributes<HTMLSpanElement> & {
  dot?: boolean; hue?: string;
}) {
  return <span className={cn("signal-chip", className)} data-dot={dot}
    style={{ ...style, ...(hue ? { "--h": hue } : {}) } as React.CSSProperties} {...props} />;
}

// ComponentProps rather than InputHTMLAttributes so `ref` is part of the type. React
// 19 passes refs to function components as an ordinary prop, and the template editor
// needs one to put the caret back after inserting a tag into the subject.
export function Input({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return <input className={cn("glass-input", className)} {...props} />;
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-xs font-medium text-muted ",
        className
      )}
      {...props}
    />
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-bad">{children}</p>;
}

/**
 * The line under a field that says what it is for in plain words.
 *
 * Smaller and quieter than MutedText: this sits inside a form, attached to one
 * control, where MutedText introduces a whole section.
 */
export function Hint({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[11px] leading-snug text-muted ",
        className
      )}
    >
      {children}
    </span>
  );
}

export function MutedText({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-sm text-muted">{children}</p>
  );
}

export function ViewState({ loading = false, label }: { loading?: boolean; label: string }) {
  return <div className="view-state" role="status" aria-live="polite" aria-busy={loading}>
    {loading && <div className="view-state-skeleton" aria-hidden="true"><i /><i /></div>}
    <p>{label}</p>
  </div>;
}
