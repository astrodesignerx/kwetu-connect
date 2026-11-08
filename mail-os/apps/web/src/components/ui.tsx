import { CircleAlert } from "lucide-react";
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

// A status chip. Strong marks the one state that needs attention, with weight rather than colour.
export function Chip({ strong = false, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { strong?: boolean }) {
  return <span className={cn("signal-chip", className)} data-strong={strong} {...props} />;
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
        "text-xs font-medium text-muted",
        className
      )}
      {...props}
    />
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="error-line" role="alert"><CircleAlert size={16} aria-hidden />{children}</p>;
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
        "text-xs text-muted",
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
