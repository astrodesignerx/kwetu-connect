"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Copy, Search } from "lucide-react";
import { api } from "@/lib/api";

/**
 * What the app knows about the person behind an address.
 *
 * This used to be a popover hanging off every avatar in the thread : which put a
 * click target inside the control that expands a message, so the two competed.
 * It is now the payload of the reader's one "Details" disclosure, next to the
 * raw addressing: same information, one place to ask for it.
 *
 * The lookup is the thread's own associations, which the notes panel already
 * loads for the client linker, so opening details usually costs no request.
 */
export function ContactDetails({
  threadId,
  address,
  mailboxId,
}: {
  threadId: string;
  address: string | null;
  mailboxId: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ["thread-associations", threadId],
    queryFn: () => api.getThreadAssociations(threadId),
  });

  const contact = address
    ? data?.contacts.find((c) => c.email.toLowerCase() === address.toLowerCase())
    : undefined;
  const company = data?.company ?? null;

  const searchHref = () => {
    const next = new URLSearchParams();
    if (mailboxId) next.set("m", mailboxId);
    if (address) next.set("q", address);
    return `/mail?${next.toString()}`;
  };

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied outright; the address is on screen and
      // selectable either way, so this is not worth an error state.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {company && (
        <Link
          href={`/clients/detail?id=${company.id}`}
          className="chip chip-client gap-1.5 !py-1 transition-[transform,opacity] duration-150 ease-out hover:border-fg"
        >
          <span
            aria-hidden
            className="grid h-4 w-4 place-items-center rounded-[4px]"
            style={{ background: "var(--raise)" }}
          >
            <Building2 size={10} className="text-fg" />
          </span>
          {company.name}
        </Link>
      )}

      {contact && (
        <span className="chip !py-1">
          {contact.messageCount} message{contact.messageCount === 1 ? "" : "s"} on file
        </span>
      )}

      {address && (
        <Link href={searchHref()} className="reader-action !px-2 !py-1 !text-[11px]">
          <Search aria-hidden size={12} />
          All mail from this address
        </Link>
      )}

      {address && (
        <button type="button" onClick={copy} className="reader-action !px-2 !py-1 !text-[11px]">
          {copied ? (
            <Check aria-hidden size={12} className="text-fg" />
          ) : (
            <Copy aria-hidden size={12} />
          )}
          {copied ? "Copied" : "Copy address"}
        </button>
      )}

      {!company && (
        <span className="text-[11px] text-muted">
          Not linked to a client. Use the notes panel below.
        </span>
      )}
    </div>
  );
}
