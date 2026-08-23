-- Pilot readiness: keep street addresses private, and capture demand we can't
-- serve yet.

-- ---------------------------------------------------------------------------
-- 1. Street-address privacy
--
-- Homeowners are told their exact address stays private until they approve an
-- advertiser, and every screen honored that. The database did not: the select
-- policy granted a whole-row read on any live listing, so a signed-in
-- advertiser could pull `street_address` straight from the REST API. With real
-- homeowners about to sign up, the promise has to hold at the data layer.
--
-- The split: the base table is readable by its owner and by an advertiser who
-- has actually been approved; everyone else reads a view carrying only the
-- fields the marketplace needs to shop on.
-- ---------------------------------------------------------------------------

drop policy "live listings are public" on listings;

create policy "owner reads own listings" on listings
  for select using (auth.uid() = owner_id);

-- Once a homeowner has said yes, the advertiser needs the address to install.
create policy "approved advertiser reads the listing" on listings
  for select using (
    exists (
      select 1 from requests r
      where r.listing_id = listings.id
        and r.requester_id = auth.uid()
        and r.status in ('approved', 'active', 'completed')
    )
  );

-- Deliberately a security-definer view (the default for `create view`): it must
-- see past the row-level policy above to publish the safe columns. Supabase's
-- linter flags such views, and it is right to — this one is the exception, and
-- the column list is the whole security boundary.
--
-- Coordinates are rounded to three decimals, about 110 metres. That still lands
-- the map pin on the right block and the right intersection, which is what an
-- advertiser is shopping for, without publishing which house it is.
create view listings_public as
select
  id,
  jurisdiction_id,
  headline,
  city,
  state,
  postal_code,
  round(lat::numeric, 3)::double precision  as lat,
  round(lng::numeric, 3)::double precision  as lng,
  aadt_sum,
  traffic_segments,
  traffic_source,
  traffic_year,
  signalized,
  corner_lot,
  monthly_rate,
  status,
  is_demo,
  created_at
from listings
where status = 'live';

grant select on listings_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. waitlist — everyone who arrives from outside the pilot area
--
-- The pilot is Kansas City metro. Someone in St. Louis or Denver who types
-- their address and gets turned away is a real signal, and throwing it away
-- would be the expensive kind of tidy.
--
-- Insert-only by design: anyone may add themselves, nobody may read the list
-- back. Only the service-role key (the admin screen) can see it.
-- ---------------------------------------------------------------------------
create table waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  -- Which side of the marketplace they're on; null when they didn't say.
  role        user_role,
  city        text,
  state       text,
  note        text,
  -- Where on the site they joined from, so we can tell intent apart.
  source      text not null default 'unknown',
  created_at  timestamptz not null default now()
);

-- One row per person per place. Someone re-submitting should update their note,
-- not stack up duplicates.
create unique index waitlist_person_place
  on waitlist (lower(email), coalesce(lower(city), ''), coalesce(upper(state), ''));

alter table waitlist enable row level security;

create policy "anyone can join the waitlist" on waitlist
  for insert with check (true);
