-- Allow validated customer edits to an unpaid quote while retaining its reference.
-- Run after 0003 before deploying the booking edit flow.
create or replace function public.commit_booking_store(expected_revision bigint, changes jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.settings set revision = revision + 1 where id = 1 and revision = expected_revision;
  if not found then return false; end if;
  if changes ? 'settings' then update public.settings set value = changes -> 'settings' where id = 1; end if;
  insert into public.advertisers select * from jsonb_populate_recordset(null::public.advertisers, changes -> 'advertisers')
    on conflict (id) do update set name = excluded.name, phone = excluded.phone, email = excluded.email,
      business = excluded.business, pays_by = excluded.pays_by;
  insert into public.bookings select * from jsonb_populate_recordset(null::public.bookings, changes -> 'bookings')
    on conflict (id) do update set length_seconds = excluded.length_seconds, how_often = excluded.how_often,
      days = excluded.days, blocks = excluded.blocks, cells = excluded.cells, start_date = excluded.start_date,
      end_date = excluded.end_date, plays = excluded.plays, full_price_kes = excluded.full_price_kes,
      discount_percent = excluded.discount_percent, price_kes = excluded.price_kes,
      status = excluded.status, payment_note = excluded.payment_note, updated_at = excluded.updated_at;
  insert into public.adverts select * from jsonb_populate_recordset(null::public.adverts, changes -> 'adverts')
    on conflict (id) do update set decision = excluded.decision, reason = excluded.reason;
  insert into public.status_changes select * from jsonb_populate_recordset(null::public.status_changes, changes -> 'history');
  return true;
end;
$$;

create or replace function public.booking_edits_ready() returns boolean
language sql stable set search_path = '' as $$ select true $$;
revoke all on function public.booking_edits_ready() from public, anon, authenticated;
grant execute on function public.booking_edits_ready() to service_role;
