"use client";

import { Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShellContent } from "@/components/app-shell";
import MailPage from "@/app/mail/page";

const mailbox = { id: "fixture-mailbox", email: "studio@example.test", userId: "fixture-user", isActive: true, syncError: null, lastSyncAt: "2026-11-07T09:00:00Z" };
const overview = { mailboxes: [mailbox], unreadCount: 3, totalThreads: 5 };
const people = ["Wanjiru Kiprop", "Peter Otieno", "Grace Chebet", "Brian Mutai", "Amina Otieno"];
const subjects = ["Advert for the 14 Nov start", "Re: Missing advert file", "Price for December weekends", "Proof of play for October", "Artwork approved for next week"];
const previews = ["Here is our 10 second advert. Could it play in the mornings only?", "We are finishing the video. Can we start on 13 Nov instead?", "Could you send the price for 20 s, Fri to Sun evenings?", "Thanks, the photos look great. Same plan for December, please.", "Everything is ready for the next flight. Thank you for the update."];

export default function MailFixture() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const scenario = new URLSearchParams(window.location.search).get("scenario");
    const originalFetch = window.fetch;
    const threads = people.map((person, index) => ({ id: `fixture-${index + 1}`, subject: subjects[index], snippet: previews[index], participants: `${person} <person${index}@example.test>`, lastDate: "2026-11-07T08:40:00Z", firstDate: "2026-11-06T08:00:00Z", hasUnread: index < 3, messageCount: index === 0 ? 3 : 1, hasAttachments: index === 0, replyState: index < 3 ? "ToReply" : "Awaiting", stateSince: "2026-11-06T08:40:00Z", needsNudge: false, mailboxConnectionId: mailbox.id, clientId: "fixture-client", clientName: ["Nandi Hills Tea Room", "Ziwa Bakery", "Kimumu Events", "Signal Lounge", "Nandi Hills Tea Room"][index], moved: "" }));
    const company = { id: "fixture-client", name: "Nandi Hills Tea Room", domain: "example.test" };
    const project = { id: "fixture-project", name: "Chai ya asubuhi", companyId: company.id };
    let assignment: object | null = { threadId: "fixture-1", userId: "fixture-user", userDisplayName: "Amina Otieno", userEmail: "studio@example.test" };
    const notes = [{ id: "fixture-note", threadId: "fixture-1", authorId: "fixture-user", authorDisplayName: "Amina", body: "Prefers calls after 2 pm. The owner signs off all artwork.", createdAt: "2026-11-04T14:00:00Z" }];
    const templates = ["Advert approved", "Payment received", "Mornings only, new price", "Booking confirmed"].map((name, index) => ({ id: `template-${index}`, name, bodyHtml: `<p>${name}. We will send the details shortly.</p>`, variables: [], skipBrandWrap: false }));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const currentOverview = scenario === "no-mailbox" ? { ...overview, mailboxes: [] } : overview;
    client.setQueryData(["overview"], currentOverview);
    window.fetch = async (input, init) => {
      const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(address, window.location.origin);
      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/hubs/")) return originalFetch(input, init);
      const path = url.pathname;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const thread = threads.find((item) => path.includes(`/${item.id}`));
      if (path === "/api/mail/overview") return json(currentOverview);
      if (path === "/api/mailboxes") return json(currentOverview.mailboxes);
      if (path === "/api/mail/thread-counts") return json({ inbox: 5, unread: threads.filter((item) => item.hasUnread).length, mine: 2, sent: 0, archive: 0, all: 5 });
      if (path === "/api/mail/insights") return json(threads.filter((item) => url.searchParams.getAll("ids").includes(item.id)));
      if (path === "/api/mail/threads") {
        if (scenario === "error") return json({ error: "Fixture mail error" }, 503);
        if (scenario === "loading") await new Promise((resolve) => setTimeout(resolve, 20_000));
        const folder = url.searchParams.get("folder");
        const query = url.searchParams.get("q")?.toLowerCase() ?? "";
        const items = scenario === "empty" ? [] : threads.filter((item) => (folder === "archive" ? item.moved === "Archive" : !item.moved) && (folder !== "unread" || item.hasUnread) && (folder !== "assigned" || ["fixture-1", "fixture-3"].includes(item.id)) && `${item.subject} ${item.participants} ${item.snippet}`.toLowerCase().includes(query));
        return json({ items, total: items.length });
      }
      if (thread && path.endsWith("/read")) { thread.hasUnread = !body.read; return new Response(null, { status: 204 }); }
      if (thread && path.endsWith("/move")) { thread.moved = body.target; return new Response(null, { status: 204 }); }
      if (thread && path.endsWith("/state")) { thread.replyState = body.state; return json(thread); }
      if (thread && path === `/api/mail/threads/${thread.id}`) return json({ ...thread, messages: [...(thread.id === "fixture-1" ? [
        { id: 99, fromName: "KCA Bookings", fromAddr: mailbox.email, toAddrs: "wanjiru@example.test", date: "2026-11-04T08:00:00Z", snippet: "Your booking is confirmed. We will send the schedule shortly.", bodyText: "Your booking is confirmed. We will send the schedule shortly.", hasAttachments: false, attachments: [] },
        { id: 100, fromName: "Wanjiru Kiprop", fromAddr: "wanjiru@example.test", toAddrs: mailbox.email, date: "2026-11-05T08:00:00Z", snippet: "Thank you. When do you need the video by?", bodyText: "Thank you. When do you need the video by?", hasAttachments: false, attachments: [] },
      ] : []), { id: 101, fromName: people[threads.indexOf(thread)], fromAddr: "wanjiru@example.test", toAddrs: mailbox.email, ccAddrs: "", date: thread.lastDate, snippet: thread.snippet, bodyText: "Hi KCA team,\n\nHere is our 10 second advert for the 14 Nov start. It is 768 x 432 with no sound, as you asked.\n\nOne question: could it play in the mornings only? Most of our customers pass before 10 am.\n\nAsante,\nWanjiru", bodyHtml: scenario === "remote-images" ? '<p>Image security fixture</p><img src="https://tracking.example.test/pixel.png" alt="Remote image">' : null, hasAttachments: true, attachments: [{ id: "fixture-file", fileName: "Video advert.mp4", contentType: "video/mp4", sizeBytes: 2400000, isInline: false }, { id: "fixture-logo", fileName: "Logo.png", contentType: "image/png", sizeBytes: 180000, isInline: false }] }] });
      if (path.endsWith("/associations")) return json({ company, projects: [project], contacts: [] });
      if (path.endsWith("/flights")) return json([{ id: "flight-1", projectId: project.id, siteName: "Kisumu Ndogo Rd", startDate: "2026-11-14", endDate: "2026-12-11" }, { id: "flight-2", projectId: project.id, siteName: "September flight", startDate: "2026-09-01", endDate: "2026-09-28" }]);
      if (path.endsWith("/assignment")) { if (init?.method === "POST" || init?.method === "PUT") assignment = { userId: body.userId, userDisplayName: "Amina Otieno" }; return json(assignment); }
      if (path.endsWith("/notes")) { if (init?.method === "POST") notes.push({ ...notes[0], id: `note-${notes.length}`, body: body.body }); return json(notes); }
      if (path === "/api/members" || path === "/api/team/members") return json([{ id: "fixture-user", displayName: "Amina Otieno", email: mailbox.email }]);
      if (path === "/api/companies") return json([company]);
      if (path === "/api/templates") return json(templates);
      if (path.startsWith("/api/templates/")) return json(templates.find((item) => path.endsWith(item.id)) ?? templates[0]);
      if (path === "/api/ai/status") return json({ configured: true });
      if (path === "/api/ai/summarize") return json({ summary: "She sent the 10 s advert and asks whether it can play in the mornings only. The booking is paid." });
      if (path === "/api/ai/reply") return json({ reply: "Thank you. We will confirm the morning schedule shortly." });
      if (path === "/api/ai/rewrite") return json({ body: "Thank you. We will confirm the morning schedule shortly." });
      if (path === "/api/mail/brief") return json({ unreadCount: 3, waitingOnMe: threads.filter((item) => item.replyState === "ToReply").map((item) => ({ ...item, waitingSeconds: 86400 })), awaitingCount: 2, upcomingFlights: [{ id: "flight-1", projectId: project.id, clientId: company.id, client: company.name, siteName: "Kisumu Ndogo Rd", startDate: "2026-11-14", endDate: "2026-12-11" }], firstReply: { medianSeconds: 3600, count: 12, workingDays: 7, daily: [{ date: "2026-11-06", count: 3, medianSeconds: 4200 }, { date: "2026-11-07", count: 4, medianSeconds: 3600 }] } });
      if (path === "/api/mail/drafts") return json(init?.method === "POST" ? { ...body, id: "fixture-draft", rowVersion: 1 } : []);
      if (path === "/api/brand-kit") return json({ name: "Kwetu Connect Advertising", primaryColor: "#171717", backgroundColor: "#ffffff", textColor: "#171717" });
      return json({ error: `No fixture for ${path}. No request was sent.` }, 503);
    };
    queueMicrotask(() => setReady(true));
    return () => { window.fetch = originalFetch; client.clear(); };
  }, [client]);
  if (!ready) return <p role="status">Loading mail fixtures...</p>;
  return <QueryClientProvider client={client}><Suspense><ShellContent variant="app"><MailPage /></ShellContent></Suspense></QueryClientProvider>;
}
