-- Exact day and time boxes for a booking, as "day-block" keys (e.g. '6-morning').
-- Run after 0002. Older bookings keep cells null: every chosen day at every chosen time.
alter table public.bookings add column if not exists cells text[];
