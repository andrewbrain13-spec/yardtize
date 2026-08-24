-- Moderation: taking a yard down, and stopping an account.
--
-- The platform's stated posture is a 48-hour takedown on any notice from a
-- city, an HOA or the homeowner. Until now the operations screen could only
-- watch — the only way to act was to edit the database by hand, which is not a
-- thing to be doing under a 48-hour clock.

-- ---------------------------------------------------------------------------
-- Suspension
--
-- A timestamp rather than a boolean: when somebody was stopped is worth as
-- much as whether, and a null reads unambiguously as "in good standing".
--
-- Not settable by the account itself. Migration 0008 took the table-level
-- update grant away from `authenticated` and handed back only `role` and
-- `full_name`, so any column added here is read-only to its owner by default.
-- ---------------------------------------------------------------------------
alter table profiles add column suspended_at timestamptz;
alter table profiles add column suspended_reason text;

comment on column profiles.suspended_at is
  'Set by an operator. Hides the account''s listings and blocks new listings and requests.';

-- Security definer, for the same reason as viewer_has_approved_request: a
-- policy on listings that read profiles directly would be answered under the
-- reader's own row-level security, which shows them nobody's profile but their
-- own — so the check would silently pass for everyone.
create function public.viewer_is_suspended()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.suspended_at is not null
  );
$$;

revoke execute on function public.viewer_is_suspended() from public;
grant execute on function public.viewer_is_suspended() to authenticated;

-- A suspended account cannot list a new yard...
drop policy "owners insert own listings" on listings;
create policy "owners insert own listings" on listings
  for insert with check (
    auth.uid() = owner_id and not public.viewer_is_suspended()
  );

-- ...nor ask for one.
drop policy "businesses create own requests" on requests;
create policy "businesses create own requests" on requests
  for insert with check (
    auth.uid() = requester_id and not public.viewer_is_suspended()
  );

-- And their existing yards leave the marketplace. The view is the marketplace's
-- only window onto listings (migration 0006), so dropping them here removes
-- them from browse, from search and from the public counts in one place.
create or replace view listings_public as
select
  l.id,
  l.jurisdiction_id,
  l.headline,
  l.city,
  l.state,
  l.postal_code,
  round(l.lat::numeric, 3)::double precision  as lat,
  round(l.lng::numeric, 3)::double precision  as lng,
  l.aadt_sum,
  l.traffic_segments,
  l.traffic_source,
  l.traffic_year,
  l.signalized,
  l.corner_lot,
  l.monthly_rate,
  l.status,
  l.is_demo,
  l.created_at
from listings l
join profiles p on p.id = l.owner_id
where l.status = 'live'
  and p.suspended_at is null;

grant select on listings_public to anon, authenticated;
