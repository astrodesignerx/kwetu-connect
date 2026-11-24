-- Personal mailboxes for the standalone Mail page. Each staff member connects their own mailbox; the app
-- reads and sends through the mailbox's own IMAP and SMTP servers. Drafts and staged uploads are stored below.
-- The password is encrypted by the app (AES-256-GCM, key in MAIL_ENCRYPTION_KEY) before it is stored.
-- Only the server (service role) touches this table: row level security is on and no policy grants access.
create table public.staff_mailboxes (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null references public.staff(email) on delete cascade check (owner_email = lower(owner_email)),
  label text not null check (char_length(label) between 1 and 60),
  email text not null check (email = lower(email)),
  imap_host text not null,
  imap_port int not null check (imap_port between 1 and 65535),
  imap_secure boolean not null,
  smtp_host text not null,
  smtp_port int not null check (smtp_port between 1 and 65535),
  smtp_secure boolean not null,
  username text not null,
  password_enc text not null check (password_enc like 'enc:v1:%'),
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  last_unread_count int not null default 0 check (last_unread_count >= 0),
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_email, email)
);
alter table public.staff_mailboxes enable row level security;
revoke all on public.staff_mailboxes from anon, authenticated;

create table if not exists public.mail_drafts (
  id uuid primary key,
  owner_email text not null references public.staff(email) on delete cascade check (owner_email = lower(owner_email)),
  mailbox_id uuid not null references public.staff_mailboxes(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  send_state text not null default 'draft' check (send_state in ('draft', 'sending', 'sent', 'uncertain')),
  send_hash text,
  sent_at timestamptz,
  row_version int not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mail_drafts_owner_mailbox_idx on public.mail_drafts (owner_email, mailbox_id, updated_at desc);
alter table public.mail_drafts enable row level security;
revoke all on public.mail_drafts from anon, authenticated;

create table if not exists public.mail_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null references public.staff(email) on delete cascade check (owner_email = lower(owner_email)),
  draft_id uuid references public.mail_drafts(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (char_length(content_type) between 1 and 120),
  size_bytes int not null check (size_bytes between 0 and 4194304),
  data_base64 text not null,
  created_at timestamptz not null default now()
);
create index if not exists mail_uploads_owner_draft_idx on public.mail_uploads (owner_email, draft_id);
alter table public.mail_uploads enable row level security;
revoke all on public.mail_uploads from anon, authenticated;
create index if not exists mail_uploads_expiry_idx on public.mail_uploads (created_at);

grant all on public.staff_mailboxes, public.mail_drafts, public.mail_uploads to service_role;
