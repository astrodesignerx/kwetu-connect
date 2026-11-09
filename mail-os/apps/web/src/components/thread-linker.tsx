"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/glass";
import { MutedText } from "@/components/ui";

export function ThreadLinker({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["thread-associations", threadId],
    queryFn: () => api.getThreadAssociations(threadId),
  });
  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: api.listCompanies,
  });
  const [picking, setPicking] = useState(false);

  const linkCompany = useMutation({
    mutationFn: (companyId: string) => api.linkThreadToCompany(threadId, companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread-associations", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      setPicking(false);
    },
  });
  const unlinkCompany = useMutation({
    mutationFn: () => api.unlinkThreadFromCompany(threadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread-associations", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
  const linkProject = useMutation({
    mutationFn: (projectId: string) => api.linkThreadToProject(threadId, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread-associations", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });
  const unlinkProject = useMutation({
    mutationFn: (projectId: string) => api.unlinkThreadFromProject(threadId, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thread-associations", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  if (isLoading || !data) {
    return <MutedText>Loading client links…</MutedText>;
  }

  return (
    <GlassPanel className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted">
          Client
        </h3>
        <button
          className="reader-action reader-action-small"
          onClick={() => setPicking((s) => !s)}
        >
          {picking ? "Cancel" : data.company ? "Change" : "Tag to client"}
        </button>
      </div>
      {data.company ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <a
              href={`/clients/detail?id=${data.company.id}`}
              className="font-medium text-fg hover:underline"
            >
              {data.company.name}
            </a>
            <button
              className="tool-link"
              onClick={() => unlinkCompany.mutate()}
              title="Unlink from this client"
            >
              ✕
            </button>
          </div>
          {data.projects.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted">
                Projects
              </div>
              {data.projects.map((p) => {
                const linked = data.projects.some((x) => x.id === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span>{p.name}</span>
                    <button
                      className="tool-link"
                      onClick={() =>
                        linked
                          ? unlinkProject.mutate(p.id)
                          : linkProject.mutate(p.id)
                      }
                    >
                      {linked ? "✕" : "+"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : picking ? (
        <CompanyPicker
          companies={companies ?? []}
          onPick={(id) => linkCompany.mutate(id)}
        />
      ) : (
        <MutedText>Not tagged to a client yet</MutedText>
      )}
      {data.contacts.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="mb-1 text-xs font-semibold text-muted">
            Contacts in this thread
          </div>
          <ul className="space-y-1 text-xs">
            {data.contacts.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.name ?? c.email}</span>
                {c.name && (
                  <span className="ml-1 text-muted">
                    {c.email}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassPanel>
  );
}

function CompanyPicker({
  companies,
  onPick,
}: {
  companies: { id: string; name: string; domain: string | null }[];
  onPick: (id: string) => void;
}) {
  if (companies.length === 0) {
    return (
      <div className="space-y-2 text-sm">
        <MutedText>No clients yet. Create one first.</MutedText>
        <Link className="signal-button btn-primary signal-button-small" href="/clients">
          Open Clients
        </Link>
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {companies.map((c) => (
        <li key={c.id}>
          <button
            onClick={() => onPick(c.id)}
            className="pick-row"
          >
            <div className="font-medium">{c.name}</div>
            {c.domain && (
              <div className="text-xs text-muted">
                {c.domain}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
