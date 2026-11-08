"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ClientAvatar, ClientTile, Segmented, Spark, StatusChip } from "@/components/signal";
import { type ClientActivity } from "@/lib/signal-clients";
import s from "./client-directory.module.css";

export function ClientDirectory({ clients }: { clients: ClientActivity[] }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const filtered = clients.filter(c => `${c.name} ${c.domain ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className={s.directory} aria-label="Client directory">
    <div className={s.tools}>
      <input aria-label="Find a client or domain" placeholder="Find a client or domain" value={search} onChange={e => setSearch(e.target.value)} className={s.search} />
      <Segmented label="Client view" value={view} onChange={setView} options={[{ value: "grid", label: "Grid", panelId: "client-results" }, { value: "list", label: "List", panelId: "client-results" }]} />
    </div>
    {!clients.length ? <p className={s.empty}>No clients yet. Create a client to bring their projects and conversations together.</p> : !filtered.length ? <p className={s.empty}>No clients match that search.</p> :
      <div id="client-results" className={view === "grid" ? s.grid : s.list} data-view={view} key={view}>
        {filtered.map((client, index) => {
          const hue = "var(--muted)";
          const statusColour = client.status === "WaitingOnUs" ? "var(--mail-waiting)" : hue;
          const status = client.status === "WaitingOnUs" ? "Waiting on us" : "All replied";
          const href = `/clients/detail?id=${encodeURIComponent(client.id)}`;
          const spark = <Spark values={client.weeks.map(w => w.conversations)} colour={hue} width={100} height={32} label={`Weekly conversations: ${client.weeks.map(w => `${w.startDate}: ${w.conversations}`).join(", ")}`} />;
          return <div key={client.id} className={s.item} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
            {view === "grid" ? <ClientTile name={client.name} colour={hue} status={status} description={client.domain ?? undefined} href={href}>
              <div className={s.meta}><span>{client.threadCount} conversations</span>{spark}</div>
            </ClientTile> : <Link href={href} className={s.row}>
              <ClientAvatar name={client.name} colour={hue} />
              <div className={s.identity}><strong>{client.name}</strong><small>{client.domain || `${client.projectCount} projects`}</small></div>
              <div className={s.trend}>{spark}</div><StatusChip label={status} colour={statusColour} />
            </Link>}
          </div>;
        })}
      </div>}
  </section>;
}
