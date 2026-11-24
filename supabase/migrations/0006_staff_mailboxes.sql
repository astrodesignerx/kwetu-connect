-- Personal mailboxes for the manager's Mail page. Each staff member connects their own mailbox; the app
-- reads and sends through the mailbox's own IMAP and SMTP servers, so no mail is copied into this database.
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
  created_at timestamptz not null default now(),
  unique (owner_email, email)
);
alter table public.staff_mailboxes enable row level security;
revoke all on public.staff_mailboxes from anon, authenticated;
