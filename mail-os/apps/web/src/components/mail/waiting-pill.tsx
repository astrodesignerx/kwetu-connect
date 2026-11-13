import { Clock } from 'lucide-react';
import { durationLabel } from '@/lib/signal-mail';
import s from '@/app/mail/page.module.css';

export function WaitingPill({ seconds }: { seconds: number }) {
  const label = durationLabel(Math.max(0, seconds));
  const accessible = label.replace(/(\d+)d/g, '$1 days').replace(/(\d+)h/g, '$1 hours').replace(/(\d+)m/g, '$1 minutes').replace(/(\d+)s/g, '$1 seconds').replace(/\b1 (days|hours|minutes|seconds)\b/g, (_, unit: string) => `1 ${unit.slice(0, -1)}`);
  return <small className={s.waitingLabel} aria-label={`Waiting ${accessible}`}><Clock size={12} aria-hidden />{label}</small>;
}
