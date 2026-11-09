"use client";

import { ErrorText } from "@/components/ui";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signalApi, type ProjectFlight } from "@/lib/signal-api";
import { nairobiToday, validateFlight } from "@/lib/signal-clients";
import { Button } from "@/components/ui";
import { DateField } from "@/components/date-field";
import s from "./forms.module.css";

export function FlightForm({ projects, initial, onDone }: {
  projects: { id: string; name: string }[]; initial?: ProjectFlight; onDone: () => void;
}) {
  const cache = useQueryClient();
  const [projectId, setProjectId] = useState(initial?.projectId ?? projects[0]?.id ?? "");
  const [siteName, setSiteName] = useState(initial?.siteName ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? nairobiToday());
  const [endDate, setEndDate] = useState(initial?.endDate ?? nairobiToday());
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => initial ? signalApi.updateFlight(projectId, initial.id, { siteName, startDate, endDate })
      : signalApi.createFlight(projectId, { siteName, startDate, endDate }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["project-flights"] });
      void cache.invalidateQueries({ queryKey: ["client-insights"] });
      void cache.invalidateQueries({ queryKey: ["mail-brief"] });
      onDone();
    },
  });
  return <form className={s.form} onSubmit={event => {
    event.preventDefault();
    const problem = validateFlight({ siteName, startDate, endDate }) ?? (!projectId ? "Choose a project" : null);
    setError(problem);
    if (!problem && !save.isPending) save.mutate();
  }}>
    <h2>{initial ? "Edit flight" : "Book a flight"}</h2>
    <div className={s.fields}>
      <label>Project<select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={!!initial} required>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Site name<input autoFocus required maxLength={200} value={siteName} onChange={e => setSiteName(e.target.value)} /></label>
      <label>Start date<DateField required aria-label="Start date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label>End date<DateField required aria-label="End date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
    </div>
    {(error || save.isError) && <ErrorText>{error ?? save.error?.message}</ErrorText>}
    <div className={s.actions}><Button type="button" variant="ghost" disabled={save.isPending} onClick={onDone}>Cancel</Button><Button disabled={save.isPending}>{save.isPending ? "Saving..." : "Save flight"}</Button></div>
  </form>;
}
