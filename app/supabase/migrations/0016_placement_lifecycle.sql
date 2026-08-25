-- What happens to a placement after it goes live.
--
-- Until now "active" was the end of the road: nothing recorded that the sign
-- actually went up, nothing proved it, nothing reminded anyone to take it
-- down, and the 48-hour takedown guarantee — the thing the whole compliance
-- posture rests on — had no clock behind it.

create type placement_event_kind as enum (
  'installed',
  'takedown_requested',
  'removed',
  'note'
);

-- ---------------------------------------------------------------------------
-- The timeline. Append-only by construction: there is no update or delete
-- policy, so what happened stays as it was recorded.
-- ---------------------------------------------------------------------------
create table placement_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests (id) on delete cascade,
  kind        placement_event_kind not null,
  actor_id    uuid references profiles (id) on delete set null,
  note        text,
  -- Storage path in the private placement-photos bucket.
  photo_path  text,
  created_at  timestamptz not null default now()
);

create index placement_events_request_idx on placement_events (request_id, created_at);

alter table placement_events enable row level security;

create policy "parties read the timeline" on placement_events
  for select using (public.viewer_is_party_to(request_id));

-- ---------------------------------------------------------------------------
-- Denormalised onto the placement, because these three gate what the interface
-- offers and a screen should not have to fold a timeline to decide whether to
-- show a button.
-- ---------------------------------------------------------------------------
alter table requests
  add column installed_at            timestamptz,
  add column removed_at              timestamptz,
  add column takedown_requested_at   timestamptz,
  add column takedown_reason         text;

comment on column requests.takedown_requested_at is
  'Starts the 48-hour clock. Set by either party or by an operator, no reason required from the homeowner.';

-- ---------------------------------------------------------------------------
-- Reminders already sent, so a daily job cannot mail the same person twice
-- about the same thing. The unique index is the whole mechanism.
-- ---------------------------------------------------------------------------
create table placement_reminders (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests (id) on delete cascade,
  kind        text not null,
  sent_at     timestamptz not null default now(),
  unique (request_id, kind)
);

alter table placement_reminders enable row level security;
-- No policies: only the service role, which runs the daily job, touches this.

-- ---------------------------------------------------------------------------
-- Photographs of signs in the ground. The proof an advertiser is buying and
-- the record an operator needs when a city complains.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'placement-photos',
  'placement-photos',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "parties upload placement photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'placement-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "placement photos visible to both parties" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'placement-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from placement_events e
        where e.photo_path = storage.objects.name
          and public.viewer_is_party_to(e.request_id)
      )
    )
  );
