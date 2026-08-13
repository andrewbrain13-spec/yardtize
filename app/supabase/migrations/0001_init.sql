-- Yardtize Phase 1 — Milestone 2 schema
-- Auth + roles, listings, booking requests, and the per-city rules engine.
-- Every table has row-level security on; policies are defined alongside.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('homeowner', 'business');
create type listing_status as enum ('draft', 'live', 'paused');
create type request_status as enum ('requested', 'approved', 'declined', 'active', 'completed');
create type advertiser_type as enum ('business', 'campaign', 'nonprofit');
create type install_choice as enum ('self', 'platform');

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user. Role is null until the user picks one at
-- first login, which is what drives the post-sign-in redirect.
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text        not null,
  role        user_role,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "own profile is readable" on profiles
  for select using (auth.uid() = id);
create policy "own profile is updatable" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Populate a profile automatically whenever Supabase Auth creates a user, so
-- the app never has to handle a signed-in user with no profile row.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- jurisdictions — the compliance rules engine. One row per city; `rules` holds
-- the verified sign-code limits. Adding a city is a data entry, not a code
-- change. `is_verified = false` drives the "compliance review pending" badge.
-- ---------------------------------------------------------------------------
create table jurisdictions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  state        text not null,
  -- Lowercased city name from the geocoder; Phase 1 matches on this.
  match_city   text,
  is_default   boolean not null default false,
  is_verified  boolean not null default false,
  rules        jsonb not null,
  citations    text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (match_city, state)
);

alter table jurisdictions enable row level security;

-- Rules are public information — the compliance card renders for logged-out
-- visitors on the landing page and listing pages.
create policy "jurisdictions are public" on jurisdictions
  for select using (true);

-- Exactly one fallback row for cities we have not verified yet.
create unique index jurisdictions_single_default
  on jurisdictions (is_default) where is_default;

-- ---------------------------------------------------------------------------
-- listings — a yard offered for placement.
-- ---------------------------------------------------------------------------
create table listings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references profiles (id) on delete cascade,
  jurisdiction_id  uuid references jurisdictions (id),

  -- Address. `street_address` is never exposed to advertisers before approval;
  -- the portal shows headline/city only (see the listings_public view).
  street_address   text not null,
  city             text not null,
  state            text not null,
  postal_code      text,
  headline         text,

  -- Property centroid and the dragged sign pin.
  lat              double precision not null,
  lng              double precision not null,
  sign_lat         double precision,
  sign_lng         double precision,

  -- Traffic, straight from the state DOT lookup. Null aadt_sum means the
  -- lookup found no counted segment — we say "no data", never a guess.
  aadt_sum         integer,
  traffic_segments jsonb not null default '[]',
  traffic_source   text,
  traffic_year     integer,

  signalized       boolean not null default false,
  corner_lot       boolean not null default false,

  suggested_rate   integer,
  monthly_rate     integer,

  status           listing_status not null default 'draft',
  -- Seeded demo listings must say so in the UI; the Karnes traffic is real.
  is_demo          boolean not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index listings_status_idx on listings (status);
create index listings_owner_idx on listings (owner_id);

alter table listings enable row level security;

create policy "live listings are public" on listings
  for select using (status = 'live' or auth.uid() = owner_id);
create policy "owners insert own listings" on listings
  for insert with check (auth.uid() = owner_id);
create policy "owners update own listings" on listings
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owners delete own listings" on listings
  for delete using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- requests — a business asking to place a sign on a listing.
-- ---------------------------------------------------------------------------
create table requests (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings (id) on delete cascade,
  requester_id      uuid not null references profiles (id) on delete cascade,

  advertiser_type   advertiser_type not null,
  advertiser_name   text not null,

  -- Stored in square feet so compliance checks compare like with like.
  sign_size_label   text not null,
  sign_size_sqft    numeric(4, 1) not null,

  duration_months   integer,
  -- Set instead of duration_months for the Sep 19 – Nov 5 election window.
  is_election_window boolean not null default false,

  install           install_choice not null,
  -- Supabase Storage object path for the uploaded sign rendering.
  rendering_path    text,
  message           text,

  status            request_status not null default 'requested',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint duration_or_election check (
    (is_election_window and duration_months is null)
    or (not is_election_window and duration_months is not null)
  )
);

create index requests_listing_idx on requests (listing_id);
create index requests_requester_idx on requests (requester_id);

alter table requests enable row level security;

-- Visible to the business that sent it and the homeowner who owns the yard.
create policy "requester or listing owner can read" on requests
  for select using (
    auth.uid() = requester_id
    or exists (
      select 1 from listings l
      where l.id = requests.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "businesses create own requests" on requests
  for insert with check (auth.uid() = requester_id);

-- The homeowner approves or declines; the requester may edit while pending.
create policy "listing owner updates request status" on requests
  for update using (
    exists (
      select 1 from listings l
      where l.id = requests.listing_id and l.owner_id = auth.uid()
    )
  );

create policy "requester updates own pending request" on requests
  for update using (auth.uid() = requester_id and status = 'requested')
  with check (auth.uid() = requester_id);

-- ---------------------------------------------------------------------------
-- aadt_cache — every state-DOT lookup is cached by rounded coordinate so the
-- demo never depends on MoDOT/KDOT uptime and repeat pins are instant.
-- ---------------------------------------------------------------------------
create table aadt_cache (
  id           uuid primary key default gen_random_uuid(),
  -- Coordinates rounded to 4dp (~11 m) form the cache key.
  lat_key      numeric(8, 4) not null,
  lng_key      numeric(9, 4) not null,
  aadt_sum     integer,
  segments     jsonb not null default '[]',
  source       text,
  data_year    integer,
  fetched_at   timestamptz not null default now(),
  unique (lat_key, lng_key)
);

alter table aadt_cache enable row level security;

create policy "aadt cache is public" on aadt_cache
  for select using (true);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger listings_touch before update on listings
  for each row execute function touch_updated_at();
create trigger requests_touch before update on requests
  for each row execute function touch_updated_at();
