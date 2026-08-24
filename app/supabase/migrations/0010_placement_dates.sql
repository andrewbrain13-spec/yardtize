-- Placements get dates, and a yard can only hold one sign at a time.
--
-- Until now a request carried a duration and no start, so nothing anywhere
-- said when a sign goes up or comes down. Three things followed from that:
-- two advertisers could be approved for the same yard over the same weeks,
-- "one tasteful sign per yard" was a promise with nothing enforcing it across
-- time, and the placement agreement had a blank where the term should be.

create extension if not exists btree_gist;

alter table requests
  add column starts_on date,
  add column ends_on   date;

comment on column requests.starts_on is
  'First day the sign is in the ground. Half-open with ends_on: [starts_on, ends_on).';

-- Existing rows predate dates. The one real request is a 2026 election-window
-- booking, and the seeded ones are demos; giving them the window's own dates
-- keeps every row valid without inventing a term somebody agreed to.
update requests
   set starts_on = coalesce(starts_on, date '2026-09-19'),
       ends_on   = coalesce(ends_on,   date '2026-11-05')
 where starts_on is null or ends_on is null;

alter table requests
  alter column starts_on set not null,
  alter column ends_on   set not null,
  add constraint request_dates_ordered check (ends_on > starts_on);

create index requests_dates_idx on requests (listing_id, starts_on, ends_on);

-- The real guarantee. Two placements that a homeowner has said yes to cannot
-- overlap on the same yard — enforced by Postgres rather than by remembering
-- to check, because the check that matters is the one that runs when two
-- approvals race each other.
--
-- Only approved and active hold the ground. Any number of advertisers may ASK
-- for the same weeks; the homeowner picking one is what takes it off the
-- market, which is also what keeps a popular corner from being blocked by
-- someone who never hears back.
alter table requests
  add constraint one_sign_per_yard_at_a_time
  exclude using gist (
    listing_id  with =,
    daterange(starts_on, ends_on, '[)') with &&
  )
  where (status in ('approved', 'active'));
