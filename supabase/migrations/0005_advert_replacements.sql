-- Let customers replace refused adverts.
-- Refused files no longer count toward the 3-advert limit; a booking holds at most 6 files in total.
-- Run after 0004, before deploying the advert replacement flow.
create or replace function public.limit_booking_adverts() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.bookings where id = new.booking_id for update;
  if (select count(*) from public.adverts where booking_id = new.booking_id and id <> new.id) >= 6 then
    raise exception 'This booking has reached its upload limit. Contact KCA.';
  end if;
  if new.decision <> 'refused' and (select count(*) from public.adverts
      where booking_id = new.booking_id and id <> new.id and decision <> 'refused') >= 3 then
    raise exception 'At most 3 adverts per booking.';
  end if;
  return new;
end;
$$;
notify pgrst, 'reload schema';
