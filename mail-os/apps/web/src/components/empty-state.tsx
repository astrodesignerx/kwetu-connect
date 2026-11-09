import { CircleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import s from "./empty-state.module.css";

/**
 * The one empty state: a line icon, a title, one line of text and at most one
 * action. `bare` drops the card for places that already sit inside one.
 */
export function EmptyState({ icon: Icon, title, text, action, bare = false, className, role }: {
  icon?: LucideIcon; title: string; text?: React.ReactNode; action?: React.ReactNode; bare?: boolean; className?: string; role?: "alert" | "status";
}) {
  return <div className={cn(s.empty, bare && s.bare, className)} role={role}>
    {Icon && <span className={s.icon} aria-hidden="true"><Icon size={18} /></span>}
    <h2 className={s.title}>{title}</h2>
    {text && <p className={s.text}>{text}</p>}
    {action && <div className={s.action}>{action}</div>}
  </div>;
}

/** The same shape for something that failed: an alert icon, the exact message and one way out. */
export function ErrorState({ title, message, onRetry, action, bare, className }: {
  title: string; message?: React.ReactNode; onRetry?: () => void; action?: React.ReactNode; bare?: boolean; className?: string;
}) {
  return <EmptyState role="alert" icon={CircleAlert} title={title} text={message} bare={bare} className={className}
    action={action ?? (onRetry && <button type="button" className="signal-button btn-default signal-button-default" onClick={onRetry}>Try again</button>)} />;
}
