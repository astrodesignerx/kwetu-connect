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
        "text-xs font-medium text-brand-black/60 dark:text-brand-cream/60",
        className
      )}
      {...props}
    />
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-700 dark:text-red-400">{children}</p>;
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
        "text-[11px] leading-snug text-brand-black/50 dark:text-brand-cream/45",
        className
      )}
    >
      {children}
    </span>
  );
}

export function MutedText({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-sm text-brand-black/65 dark:text-brand-cream/60">{children}</p>
  );
}
