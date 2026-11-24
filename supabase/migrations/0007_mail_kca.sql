-- Mail workspace only. No booking writes. Apply separately after review.
create table public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  body text not null check (char_length(body) between 1 and 10000),
  sort_order integer not null default 0,
  created_by text references public.staff(email) on delete set null
);
create table public.mail_thread_meta (
  mailbox_id uuid not null references public.staff_mailboxes(id) on delete cascade,
  thread_key text not null check (char_length(thread_key) between 1 and 200),
  assigned_email text references public.staff(email) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (mailbox_id, thread_key)
);
create index mail_thread_meta_assigned on public.mail_thread_meta (assigned_email, mailbox_id);
create table public.mail_client_notes (
  advertiser_email text primary key check (advertiser_email = lower(advertiser_email)),
  note text not null default '' check (char_length(note) <= 10000),
  updated_by text references public.staff(email) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.mail_templates enable row level security;
alter table public.mail_thread_meta enable row level security;
alter table public.mail_client_notes enable row level security;
revoke all on public.mail_templates, public.mail_thread_meta, public.mail_client_notes from anon, authenticated;
grant all on public.mail_templates, public.mail_thread_meta, public.mail_client_notes to service_role;
-- Seed replies have no staff author.
insert into public.mail_templates (name, body, sort_order) values
('Advert approved', 'Your advert has passed our review. You can check the booking status and planned dates on your booking page.', 0),
('Payment received', 'Thank you for your payment. Please check your booking page for confirmation of the amount and status.', 1),
('Send your advert', 'Please send your advert as an MP4 video or a PNG or JPEG image in 16:9, at least 768 x 432 pixels. The video length should match your booking. The screen plays without sound.', 2),
('Advert needs changes', 'Your advert needs a few changes before it can go on screen. Please check the review notes on your booking page and send an updated file.', 3),
('New price', 'Thank you for your enquiry. We can price the dates, advert length and number of plays you need. Please share your preferred plan, or use our booking page to see the price.', 4);
