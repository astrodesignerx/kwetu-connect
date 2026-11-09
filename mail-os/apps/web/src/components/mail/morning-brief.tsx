"use client";

import { ErrorState } from "@/components/empty-state";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { signalApi } from "@/lib/signal-api";
import { durationLabel } from "@/lib/signal-mail";
import { Spark } from "@/components/signal";
import s from "@/app/mail/page.module.css";
import { formatDate, formatShortDate, formatWeekday, plural } from "@/lib/format";

export function MorningBrief() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["mail-brief"], queryFn: ({ signal }) => signalApi.brief(signal), refetchInterval: 60_000 });
  if (isPending) return <section className={s.brief} role="status"><p className={s.muted}>Loading your brief...</p></section>;
  if (isError || !data) return <section className={s.brief}><ErrorState bare title="Your brief could not load" onRetry={() => void refetch()} /></section>;
  return <section className={s.brief} aria-label="Morning brief">
    <header className={s.hero}>
      <h1>Morning brief</h1>
      <p className={s.briefDate}><time dateTime={new Date().toISOString()}>{formatWeekday(new Date())} {formatDate(new Date())}</time></p>
      <dl className={s.briefCounts}>{[
        [data.unreadCount, "unread"], [data.waitingOnMe.length, "waiting on you"],
        [data.awaitingCount, "awaiting reply"], [data.upcomingFlights.length, "upcoming flights"],
      ].map(([value, label]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
    </header>
    <div className={s.bento}>
      <article className={s.card}>
        <h2 className={s.sectionLabel}>Waiting on you</h2>
        {data.waitingOnMe.length ? <ul className={s.waiting}>{data.waitingOnMe.map((thread) => <li key={thread.id}>
          <Link href={`/mail?id=${encodeURIComponent(thread.id)}`}><span>{thread.subject || "(no subject)"}</span><small>Waiting {durationLabel(thread.waitingSeconds)}</small></Link>
        </li>)}</ul> : <p className={s.muted}>Nothing waiting on you</p>}
      </article>
      <article className={s.card}>
        <h2 className={s.sectionLabel}>First reply</h2>
        <strong className={s.metric}>{durationLabel(data.firstReply.medianSeconds)}</strong>
        <p className={s.muted}>Median across the team, from {plural(data.firstReply.count, "reply", "replies")} in the last {plural(data.firstReply.workingDays, "working day")}</p>
        {data.firstReply.daily.some((day) => day.medianSeconds !== null) && <Spark values={data.firstReply.daily.flatMap((day) => day.medianSeconds === null ? [] : [day.medianSeconds])} label="Daily median first reply time in seconds, for days with replies only" width={210} height={54} />}
      </article>
      <article className={`${s.card} ${s.flights}`}>
        <h2 className={s.sectionLabel}>Next go-lives</h2>
        {data.upcomingFlights.length ? <ul className={s.flightRows}>{data.upcomingFlights.map((flight) => <li key={flight.id}>
          <Link href={`/clients/detail?id=${encodeURIComponent(flight.clientId)}`}>
            <b>{flight.siteName}</b><span>{flight.client}, from <time dateTime={flight.startDate}>{formatShortDate(flight.startDate)}</time></span>
          </Link>
        </li>)}</ul> : <p className={s.muted}>No upcoming flights</p>}
      </article>
    </div>
  </section>;
}
