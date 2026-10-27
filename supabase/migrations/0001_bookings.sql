create table public.staff (
  email text primary key check (email = lower(email)),
  name text not null
);
create table public.advertisers (
  id uuid primary key, name text not null, phone text not null, email text,
  business text not null, pays_by text not null check (pays_by in ('now', 'invoice')),
  created_at timestamptz not null default now()
);
create index advertisers_phone on public.advertisers(phone);
create table public.bookings (
  id uuid primary key, reference text not null unique,
  advertiser_id uuid not null references public.advertisers(id),
  length_seconds integer not null check (length_seconds > 0),
  how_often integer not null check (how_often > 0), days integer[] not null,
  blocks text[] not null, start_date date not null, end_date date not null,
  plays integer not null check (plays > 0), full_price_kes bigint not null check (full_price_kes > 0),
  discount_percent integer not null check (discount_percent between 0 and 99),
  price_kes bigint not null check (price_kes > 0),
  status text not null check (status in ('Quote', 'Paid', 'Approved', 'Live', 'Finished', 'Cancelled')),
  payment_note text not null default '', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), check (end_date >= start_date)
);
create index bookings_created_at on public.bookings(created_at desc);
create table public.adverts (
  id uuid primary key, booking_id uuid not null references public.bookings(id),
  file_path text not null, file_name text not null, seconds integer not null check (seconds > 0),
  decision text not null default 'waiting' check (decision in ('waiting', 'approved', 'refused')),
  reason text not null default '', created_at timestamptz not null default now()
);
create index adverts_booking on public.adverts(booking_id);
create table public.status_changes (
  id uuid primary key, booking_id uuid not null references public.bookings(id),
  from_status text not null, to_status text not null, staff_email text not null,
  note text not null default '', created_at timestamptz not null default now()
);
create index status_changes_booking on public.status_changes(booking_id, created_at);
create table public.settings (
  id integer primary key default 1 check (id = 1), value jsonb,
  revision bigint not null default 0
);
insert into public.settings(id) values (1);

create function public.is_kca_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where email = lower(auth.jwt() ->> 'email'));
$$;
revoke all on function public.is_kca_staff() from public;
grant execute on function public.is_kca_staff() to authenticated;

alter table public.staff enable row level security;
alter table public.advertisers enable row level security;
alter table public.bookings enable row level security;
alter table public.adverts enable row level security;
alter table public.status_changes enable row level security;
alter table public.settings enable row level security;
create policy staff_read on public.staff for select to authenticated using (public.is_kca_staff());
create policy staff_read on public.advertisers for select to authenticated using (public.is_kca_staff());
create policy staff_read on public.bookings for select to authenticated using (public.is_kca_staff());
create policy staff_read on public.adverts for select to authenticated using (public.is_kca_staff());
create policy staff_read on public.status_changes for select to authenticated using (public.is_kca_staff());
create policy staff_read on public.settings for select to authenticated using (public.is_kca_staff());
-- Writes go through the server, which checks staff for every manager action.
-- Anonymous visitors have no direct table or RPC access.
revoke all on public.staff, public.advertisers, public.bookings, public.adverts, public.status_changes, public.settings from anon, authenticated;
grant select on public.staff, public.advertisers, public.bookings, public.adverts, public.status_changes, public.settings to authenticated;
grant all on public.staff, public.advertisers, public.bookings, public.adverts, public.status_changes, public.settings to service_role;

create function public.limit_booking_adverts() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.bookings where id = new.booking_id for update;
  if (select count(*) from public.adverts where booking_id = new.booking_id and id <> new.id) >= 3 then
    raise exception 'At most 3 adverts per booking.';
  end if;
  return new;
end;
$$;
create trigger limit_adverts before insert or update on public.adverts
for each row execute function public.limit_booking_adverts();

-- One MVCC snapshot feeds the pure server rules. The revision guards all writes.
create function public.read_booking_store() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'revision', s.revision, 'settings', s.value,
    'advertisers', coalesce((select jsonb_agg(to_jsonb(a)) from public.advertisers a), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b)) from public.bookings b), '[]'::jsonb),
    'adverts', coalesce((select jsonb_agg(to_jsonb(a)) from public.adverts a), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at, h.id) from public.status_changes h), '[]'::jsonb)
  ) from public.settings s where s.id = 1;
$$;
create function public.commit_booking_store(expected_revision bigint, changes jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  -- This row lock serialises payment/capacity, phone limits, settings and adverts.
  update public.settings set revision = revision + 1
    where id = 1 and revision = expected_revision;
  if not found then return false; end if;
  if changes ? 'settings' then update public.settings set value = changes -> 'settings' where id = 1; end if;
  insert into public.advertisers select * from jsonb_populate_recordset(null::public.advertisers, changes -> 'advertisers')
    on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email,
      business = excluded.business, pays_by = excluded.pays_by;
  insert into public.bookings select * from jsonb_populate_recordset(null::public.bookings, changes -> 'bookings')
    on conflict (id) do update set status = excluded.status, payment_note = excluded.payment_note, updated_at = excluded.updated_at;
  insert into public.adverts select * from jsonb_populate_recordset(null::public.adverts, changes -> 'adverts')
    on conflict (id) do update set decision = excluded.decision, reason = excluded.reason;
  insert into public.status_changes select * from jsonb_populate_recordset(null::public.status_changes, changes -> 'history');
  return true;
end;
$$;
revoke all on function public.read_booking_store() from public, anon, authenticated;
revoke all on function public.commit_booking_store(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.read_booking_store() to service_role;
grant execute on function public.commit_booking_store(bigint, jsonb) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('adverts', 'adverts', false, 20971520, array['video/mp4', 'video/webm', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
create policy staff_advert_read on storage.objects for select to authenticated
using (bucket_id = 'adverts' and public.is_kca_staff());
-- Storage uploads and signed downloads also use staff-checked server operations.
