import type { ReactNode } from "react";
const SHAPES: Record<string, ReactNode> = {
  price: <><path d="M2.5 8.2V3h5.2l5.8 5.8-5 5z" /><circle cx="5.4" cy="5.8" r=".7" /></>,
  discounts: <><path d="M12 4l-8 8" /><circle cx="5" cy="5" r="1.6" /><circle cx="11" cy="11" r="1.6" /></>,
  capacity: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></>,
  lengths: <><circle cx="8" cy="9" r="4.8" /><path d="M8 6.5V9M6.5 2.5h3M8 2.5v1.7" /></>,
  often: <path d="M3 7V6a2 2 0 0 1 2-2h7M10 2l2 2-2 2M13 9v1a2 2 0 0 1-2 2H4M6 14l-2-2 2-2" />,
  lead: <path d="M3 4.5h10V13H3zM3 7h10M5.5 2.5v3M10.5 2.5v3" />,
  blocks: <path d="M2.5 3.5H7v4H2.5zM9 3.5h4.5v4H9zM2.5 9.5H7v3H2.5zM9 9.5h4.5v3H9z" />,
  hours: <path d="M2 3.5h12V11H2zM8 11v2.5M5.5 13.5h5" />,
  pencil: <path d="M3 13l.6-2.6 6.9-6.9 2 2-6.9 6.9zM9.5 4.5l2 2" />,
};
export default function SettingsRuleIcon({ name }: { name: string }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SHAPES[name]}</svg>;
}

