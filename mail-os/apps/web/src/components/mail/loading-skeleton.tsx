"use client";

import { useEffect, useState } from "react";
import s from "@/app/mail/page.module.css";

export function LoadingSkeleton({ reader = false, label }: { reader?: boolean; label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div role="status" className={reader ? `${s.readerState} ${s.readerSkeleton}` : s.listSkeleton}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">
      {reader && <div className={s.skeletonHeader}><span /><span /></div>}
      {Array.from({ length: reader ? 2 : 6 }, (_, index) => <div key={index} className={reader ? s.skeletonMessage : s.skeletonRow}>
        <span /><span /><span />
      </div>)}
    </div>
  </div>;
}
