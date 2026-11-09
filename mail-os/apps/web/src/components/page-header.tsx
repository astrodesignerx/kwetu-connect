import Link from "next/link";
import s from "./page-header.module.css";

/**
 * The title block at the top of every page. The context line above the title is
 * always there, even when empty, so every title starts at the same height.
 */
export function PageHeader({ title, context, contextHref, description, meta, action }: {
  title: React.ReactNode;
  context?: string;
  contextHref?: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return <header className={s.header}>
    <div className={s.text}>
      <p className={s.context}>{context ? contextHref ? <Link href={contextHref}>{context}</Link> : context : null}</p>
      <h1 className={s.title}>{title}</h1>
      {description && <p className={s.description}>{description}</p>}
      {meta && <div className={s.meta}>{meta}</div>}
    </div>
    {action && <div className={s.action}>{action}</div>}
  </header>;
}
