"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ViewState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ClientDirectory } from "@/components/clients/client-directory";
import { ClientForm } from "@/components/clients/client-form";
import { clientsApi } from "@/lib/signal-clients";
import s from "./page.module.css";

export default function ClientsPage() {
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["client-activity"], queryFn: ({ signal }) => clientsApi.activity(signal) });
  const clients = query.data;
  return <div className={s.page}>
    <PageHeader title="Clients" description="The people and campaigns behind your conversations"
      action={<Button variant={creating ? "default" : "primary"} onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New client"}</Button>} />
    {creating && <ClientForm onDone={() => { setCreating(false); void cache.invalidateQueries({ queryKey: ["client-activity"] }); }} />}
    {query.isPending ? <ViewState loading label="Loading clients" /> : query.isError ? <div className={s.panel} role="alert"><p>Could not load clients</p><Button variant="default" onClick={() => void query.refetch()}>Try again</Button></div> : clients && <>
      <dl className={s.stats}>
        <div><dd>{clients.length}</dd><dt>clients</dt></div>
        <div><dd>{clients.reduce((n, c) => n + c.projectCount, 0)}</dd><dt>projects</dt></div>
        <div><dd>{clients.reduce((n, c) => n + c.boardsBooked, 0)}</dd><dt>boards booked this quarter</dt></div>
      </dl>
      <ClientDirectory clients={clients} />
    </>}
  </div>;
}
