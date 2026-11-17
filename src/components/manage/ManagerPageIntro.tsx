"use client";
import { usePathname } from "next/navigation";
import ClockPill from "./ClockPill";

const PAGES: [path: string, title: string, note?: string][] = [
  ["/manage/bookings", "Bookings pipeline"],
  ["/manage/adverts", "Advert desk"],
  ["/manage/schedule", "Screen schedule"],
  ["/manage/settings", "Screen settings", "Prices and screen rules | Changes apply to new quotes only"],
];

/** Page heading row under the top bar. Overview draws its own; a single booking has its own main heading, so the title is plain text there. */
export default function ManagerPageIntro({ now }: { now: string }) {
  const pathname = usePathname();
  // These desks place their page-specific actions beside their own heading.
  if (["/manage/bookings", "/manage/adverts", "/manage/schedule", "/manage/settings"].includes(pathname)) return null;
  const page = PAGES.find(([path]) => pathname.startsWith(path));
  if (!page) return null;
  const Heading = pathname === page[0] ? "h1" : "p";
  return <div className="mg-intro">
    <div className="mg-intro-title"><Heading className="mg-heading">{page[1]}</Heading>{page[2] && <small>{page[2]}</small>}</div>
    <ClockPill now={now} />
  </div>;
}
