"use client";

import { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import type { ProjectDto } from "@kompanion/types";
import { api } from "@/lib/api";
import { signalApi, type ProjectFlight } from "@/lib/signal-api";
import { displayDate, nairobiToday } from "@/lib/signal-clients";
import { Button, ViewState } from "@/components/ui";
import { FlightPlan, StatusChip } from "@/components/signal";
import { FlightForm } from "./flight-form";
import s from "../../app/clients/detail/page.module.css";
import f from "./forms.module.css";

export function ClientProjects({ companyId, projects }: { companyId: string; projects: ProjectDto[] }) {
  const cache = useQueryClient();
  const [today] = useState(nairobiToday);
  const [windowStart, setWindowStart] = useState(today);
  const [flightEdit, setFlightEdit] = useState<ProjectFlight | "new" | null>(null);
  const [projectEdit, setProjectEdit] = useState<ProjectDto | "new" | null>(null);
  const queries = useQueries({ queries: projects.map(p => ({ queryKey: ["project-flights", p.id], queryFn: ({ signal }: { signal: AbortSignal }) => signalApi.flights(p.id, signal) })) });
  const flights = queries.flatMap(q => q.data ?? []).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.siteName.localeCompare(b.siteName));
  const removeFlight = useMutation({ mutationFn: (flight: ProjectFlight) => signalApi.deleteFlight(flight.projectId, flight.id), onSuccess: refresh });
  const removeProject = useMutation({ mutationFn: api.deleteProject, onSuccess: refresh });
  function refresh() {
    for (const key of ["company", "companies", "client-activity", "client-insights", "project-flights", "mail-brief", "thread-associations"]) void cache.invalidateQueries({ queryKey: [key] });
  }
  const windowEnd = new Date(`${windowStart}T00:00:00Z`);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 41);
  const end = windowEnd.toISOString().slice(0, 10);
  return <>
    <section className={s.panel}>
      <div className={s.sectionHead}><h2>Flight plan</h2><Button size="small" disabled={!projects.length} onClick={() => setFlightEdit("new")}>New flight</Button></div>
      {!projects.length ? <p className={s.muted}>Create a project to book its first flight.</p> : <>
        <label className={s.window}>Six weeks from <input aria-label="Flight plan start date" type="date" value={windowStart} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setWindowStart(e.target.value); }} /></label>
        {queries.some(q => q.isPending) ? <ViewState loading label="Loading flights" /> : queries.some(q => q.isError) ? <div role="alert"><p>Could not load all project flights.</p><Button variant="default" onClick={() => queries.forEach(q => void q.refetch())}>Try again</Button></div> : flights.length ? <>
          <FlightPlan label={`Flight plan from ${windowStart} to ${end}`} startDate={windowStart} today={today} sites={flights.filter(x => x.startDate <= end && x.endDate >= windowStart).map(x => ({ id: x.id, name: x.siteName, startDate: x.startDate, endDate: x.endDate }))} />
          <ul className={s.rows}>{flights.map(flight => <li key={flight.id}>
            <div className={s.grow}><strong>{flight.siteName}</strong><small>{projects.find(p => p.id === flight.projectId)?.name} / {displayDate(flight.startDate)} to {displayDate(flight.endDate)}</small></div>
            <Button size="small" variant="ghost" onClick={() => setFlightEdit(flight)} aria-label={`Edit flight at ${flight.siteName}`}>Edit</Button>
            <Button size="small" variant="ghost" disabled={removeFlight.isPending} onClick={() => { if (confirm(`Delete flight at ${flight.siteName}?`)) removeFlight.mutate(flight); }}>Delete</Button>
          </li>)}</ul>
        </> : <p className={s.muted}>No flights booked yet.</p>}
      </>}
      {removeFlight.isError && <p className={s.error} role="alert">{removeFlight.error.message}</p>}
    </section>
    {flightEdit && <FlightForm key={flightEdit === "new" ? "new" : flightEdit.id} projects={projects} initial={flightEdit === "new" ? undefined : flightEdit} onDone={() => setFlightEdit(null)} />}
    <section className={s.panel}>
      <div className={s.sectionHead}><h2>Projects</h2><Button size="small" variant="ghost" onClick={() => setProjectEdit("new")}>New project</Button></div>
      {!projects.length ? <p className={s.muted}>No projects yet.</p> : <ul className={s.rows}>{projects.map(project => {
        const booked = flights.filter(x => x.projectId === project.id);
        const active = booked.some(x => x.startDate <= today && x.endDate >= today);
        const label = active ? "Live" : booked.some(x => x.startDate > today) ? "Scheduled" : booked.length ? "Completed flights" : "No flights";
        return <li key={project.id}><div className={s.grow}><strong>{project.name}</strong>{project.description && <small>{project.description}</small>}{booked.length > 0 && <small>{displayDate(booked[0].startDate)} to {displayDate(booked.map(x => x.endDate).sort().at(-1)!)}</small>}</div>
          {!queries.some(q => q.isPending || q.isError) && <StatusChip label={label} />}
          <Button variant="ghost" size="small" onClick={() => setProjectEdit(project)}>Edit</Button><Button variant="ghost" size="small" disabled={removeProject.isPending} onClick={() => { if (confirm(`Delete project ${project.name} and its flights?`)) removeProject.mutate(project.id); }}>Delete</Button>
        </li>;
      })}</ul>}
      {removeProject.isError && <p role="alert" className={s.error}>{removeProject.error.message}</p>}
    </section>
    {projectEdit && <ProjectForm key={projectEdit === "new" ? "new" : projectEdit.id} companyId={companyId} initial={projectEdit === "new" ? undefined : projectEdit} onDone={() => { setProjectEdit(null); refresh(); }} />}
  </>;
}

function ProjectForm({ companyId, initial, onDone }: { companyId: string; initial?: ProjectDto; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const save = useMutation({ mutationFn: async () => {
    const body = { name: name.trim(), description: description || null };
    if (initial) await api.updateProject(initial.id, body);
    else await api.createProject(companyId, body);
  }, onSuccess: onDone });
  return <form className={f.form} onSubmit={e => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}>
    <h2>{initial ? "Edit project" : "New project"}</h2><div className={f.fields}><label>Name<input autoFocus required value={name} onChange={e => setName(e.target.value)} /></label><label>Description<input value={description} onChange={e => setDescription(e.target.value)} /></label></div>
    {save.isError && <p role="alert" className={f.error}>{save.error.message}</p>}
    <div className={f.actions}><Button type="button" variant="ghost" onClick={onDone} disabled={save.isPending}>Cancel</Button><Button disabled={!name.trim() || save.isPending}>{save.isPending ? "Saving..." : "Save project"}</Button></div>
  </form>;
}
