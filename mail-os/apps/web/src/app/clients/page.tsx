"use client";

import { ErrorState } from "@/components/empty-state";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ViewState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { plural } from "@/lib/format";
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
    <PageHeader title="Clients" description={clients?.length ? `${plural(clients.length, "client")}, ${plural(clients.reduce((n, c) => n + c.projectCount, 0), "project")}, ${plural(clients.reduce((n, c) => n + c.boardsBooked, 0), "board")} booked this quarter` : "The people and campaigns behind your conversations"}
      action={<Button variant={creating ? "default" : "primary"} onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New client"}</Button>} />
    {creating && <ClientForm onDone={() => { setCreating(false); void cache.invalidateQueries({ queryKey: ["client-activity"] }); }} />}
    {query.isPending ? <ViewState loading label="Loading clients" /> : query.isError ? <ErrorState title="Could not load clients" message={query.error.message} onRetry={() => void query.refetch()} /> : clients && <ClientDirectory clients={clients} />}
  </div>;
}
