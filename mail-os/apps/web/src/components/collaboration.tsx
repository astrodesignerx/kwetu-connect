"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/glass";
import { Button, MutedText } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ThreadLinker } from "@/components/thread-linker";
import { MailDisclosure } from "@/components/mail/disclosure";
import { StickyNote } from "lucide-react";

export function ThreadAssignee({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const { data: members } = useQuery({ queryKey: ["members"], queryFn: api.listMembers });
  const { data: assignment } = useQuery({
    queryKey: ["thread-assignment", threadId],
    queryFn: () => api.getAssignment(threadId),
    enabled: !!threadId,
  });
  const [picking, setPicking] = useState(false);
  const assign = useMutation({
    mutationFn: (userId: string) => api.assignThread(threadId, userId),
    onSuccess: () => {
      setPicking(false);
      void queryClient.invalidateQueries({ queryKey: ["thread-assignment", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["mail-brief"] });
    },
  });

  return (
    <GlassPanel className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted">
          Assignment
        </h3>
        <button
          className="btn-ghost !px-2 !py-0.5 !text-xs"
          onClick={() => setPicking((s) => !s)}
        >
          {picking ? "Cancel" : assignment ? "Reassign" : "Assign"}
        </button>
      </div>
      {picking ? <AssigneePicker members={members ?? []} onPick={(id) => assign.mutate(id)} /> : assignment ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
          <span className="min-w-0 break-words">{assignment.userDisplayName || assignment.userEmail}</span>
          <button className="btn-ghost !text-xs" onClick={() => assign.mutate('00000000-0000-0000-0000-000000000000')} aria-label="Unassign">Unassign</button>
        </div>
      ) : <MutedText>Not assigned.</MutedText>}
      {assign.isError && <p role="alert" className="text-xs">Could not change the assignment. Try again.</p>}
    </GlassPanel>
  );
}

function AssigneePicker({
  members,
  onPick,
}: {
  members: { id: string; email: string; displayName: string }[];
  onPick: (id: string) => void;
}) {
  if (members.length === 0) {
    return <MutedText>No teammates found.</MutedText>;
  }
  return (
    <ul className="space-y-1">
      {members.map((m) => (
        <li key={m.id}>
          <button
            onClick={() => onPick(m.id)}
            className="w-full rounded-xl border border-line p-2 text-left text-sm transition hover:bg-raise"
          >
            <div className="font-medium">{m.displayName}</div>
            <div className="text-xs text-muted">
              {m.email}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Internal notes as a collapsed footer bar.
 *
 * As a permanently open panel this took roughly a quarter of the reader : a standing
 * cost paid on every thread, when most threads have no notes and most of the time you
 * are reading mail, not annotating it. Collapsed it costs one line and still answers
 * the only question that matters at a glance: is there anything here, and what was the
 * last thing said. The editing surface appears when you actually want it.
 *
 * The tinted panel is gone too. Notes are a quiet aside, not an alert.
 */
export function ThreadNotes({ threadId, contextTools = true }: { threadId: string; contextTools?: boolean }) {
  const queryClient = useQueryClient();
  const { data: notes, isLoading, isError: notesError, refetch: reloadNotes } = useQuery({
    queryKey: ["thread-notes", threadId],
    queryFn: () => api.listNotes(threadId),
    enabled: !!threadId,
  });
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");

  const create = useMutation({
    mutationFn: (b: string) => api.createNote(threadId, b),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["thread-notes", threadId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["thread-notes", threadId] }),
  });

  const count = notes?.length ?? 0;
  const latest = notes?.[notes.length - 1];

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-2 text-left transition-[transform,opacity] duration-150 ease-out hover:bg-raise"
      >
        <StickyNote
          aria-hidden
          size={13}
          className="shrink-0 text-muted"
        />
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">
          Team notes
        </span>
        {(
          <span className="shrink-0 rounded-full bg-raise px-1.5 text-[10px] font-bold tabular-nums text-muted">
            {isLoading ? "..." : notesError ? "?" : count}
          </span>
        )}

        {/* Collapsed, the bar still carries the most recent note, so the common case
            : glancing to see whether a colleague has said anything : needs no click. */}
        {!open && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
            {isLoading
              ? "Loading…"
              : latest
                ? `${latest.authorDisplayName || latest.authorEmail}: ${latest.body}`
                : "None yet : visible to your team, never sent to the client."}
          </span>
        )}

        <span
          aria-hidden
          className={cn(
            "ml-auto shrink-0 text-[10px] text-muted transition-transform duration-200 ease-out ",
            open && "rotate-90"
          )}
        >
          ▶
        </span>
      </button>

      {notesError && <p role="alert" className="px-3 text-xs">Team notes could not load. <button onClick={() => void reloadNotes()}>Try again</button></p>}
      <MailDisclosure open={open}>
        <div className="max-h-[46vh] overflow-y-auto px-5 pb-3">
          {/* Who owns the thread and which client it belongs to used to sit in the
              reader's header, beside Reply : two bordered panels of workspace
              bookkeeping above the message itself, on every thread. They belong
              with the notes: all three are things the team says about a
              conversation rather than part of the conversation. */}
          {contextTools && <div className="mb-3 grid gap-2.5 sm:grid-cols-2">
            <ThreadAssignee threadId={threadId} />
            <ThreadLinker threadId={threadId} />
          </div>}

          {count > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5">
              {notes!.map((n) => (
                <li key={n.id} className="group flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 font-semibold">
                    {n.authorDisplayName || n.authorEmail}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-muted">
                    {n.body}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove.mutate(n.id)}
                    aria-label="Delete note"
                    className="shrink-0 rounded px-1 text-[10px] text-muted opacity-0 transition-opacity duration-150 ease-out hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) create.mutate(body.trim());
            }}
            className="flex items-center gap-2"
          >
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a note for your team…"
              className="glass-input !py-1.5 !text-xs"
            />
            <Button
              type="submit"
              disabled={!body.trim() || create.isPending}
              className="shrink-0 !px-2.5 !py-1.5 !text-xs"
            >
              {create.isPending ? "Posting…" : "Post"}
            </Button>
          </form>
        </div>
      </MailDisclosure>
    </div>
  );
}
