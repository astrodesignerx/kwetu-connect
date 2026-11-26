-- File only. Apply after review. Staff Mail workflow: snooze, follow-up reminders, hand-made client links
-- and a signature per mailbox. Every addition is optional for the app: without this migration Mail still reads
-- and sends, and only these features report that they are unavailable.

-- Conversations are keyed by subject and the other party ("campaign | client@example.com").
-- Rows written before this migration keep their subject-only key and still apply as a fallback.
alter table public.mail_thread_meta
  add column snoozed_until timestamptz,
  add column snoozed_by text references public.staff(email) on delete set null,
  add column remind_at timestamptz,
  add column remind_since timestamptz,
  add column remind_by text references public.staff(email) on delete set null;
create index mail_thread_meta_remind on public.mail_thread_meta (mailbox_id, remind_at) where remind_at is not null;

-- A sender address a person linked to a booking client by hand, for mail from an address not on a booking.
create table public.mail_client_links (
  sender_email text primary key check (sender_email = lower(sender_email) and char_length(sender_email) between 3 and 254),
  client_id text not null check (char_length(client_id) between 1 and 254),
  linked_by text references public.staff(email) on delete set null,
  linked_at timestamptz not null default now()
);
alter table public.mail_client_links enable row level security;
revoke all on public.mail_client_links from anon, authenticated;
grant all on public.mail_client_links to service_role;

alter table public.staff_mailboxes
  add column signature text not null default '' check (char_length(signature) <= 2000);
