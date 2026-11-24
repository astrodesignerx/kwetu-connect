-- File only. Shared access and conversation completion for the mail workspace.
create table public.mail_mailbox_members (
  mailbox_id uuid not null references public.staff_mailboxes(id) on delete cascade,
  staff_email text not null references public.staff(email) on delete cascade,
  added_by text references public.staff(email) on delete set null,
  created_at timestamptz not null default now(),
  primary key (mailbox_id, staff_email)
);
create index mail_mailbox_members_staff on public.mail_mailbox_members (staff_email);
alter table public.mail_mailbox_members enable row level security;
revoke all on public.mail_mailbox_members from anon, authenticated;
grant all on public.mail_mailbox_members to service_role;

alter table public.mail_thread_meta
  add column done_message_id text,
  add column done_at timestamptz,
  add column done_by text references public.staff(email) on delete set null;

-- Revocation and assignment cleanup are one atomic action, including staff deletion.
create function public.mail_clear_member_assignments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.mail_thread_meta set assigned_email = null, updated_at = now()
    where mailbox_id = old.mailbox_id and assigned_email = old.staff_email;
  return old;
end;
$$;
revoke all on function public.mail_clear_member_assignments() from public, anon, authenticated;
create trigger mail_member_removed after delete on public.mail_mailbox_members
  for each row execute function public.mail_clear_member_assignments();

-- Locks the mailbox so assignment and member removal cannot race one another.
create function public.mail_validate_assignee() returns trigger
language plpgsql security definer set search_path = public as $$
declare mailbox_owner text;
begin
  select owner_email into mailbox_owner from public.staff_mailboxes where id = new.mailbox_id for update;
  if new.assigned_email is not null and new.assigned_email <> mailbox_owner
    and not exists (select 1 from public.mail_mailbox_members where mailbox_id = new.mailbox_id and staff_email = new.assigned_email) then
    raise exception 'Assignee has no mailbox access';
  end if;
  return new;
end;
$$;
revoke all on function public.mail_validate_assignee() from public, anon, authenticated;
create trigger mail_assignment_access before insert or update on public.mail_thread_meta
  for each row execute function public.mail_validate_assignee();

create function public.mail_lock_member_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.staff_mailboxes where id = old.mailbox_id for update;
  return old;
end;
$$;
revoke all on function public.mail_lock_member_change() from public, anon, authenticated;
create trigger mail_member_removing before delete on public.mail_mailbox_members
  for each row execute function public.mail_lock_member_change();
