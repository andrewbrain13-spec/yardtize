-- The lease: one document per placement, signed away from the site, uploaded,
-- and checked by an operator before a sign goes in the ground.
--
-- No e-signature vendor. For a pilot where every placement is reviewed by a
-- person anyway, "download it, sign it however you like, send it back" costs
-- nothing, needs no account, and works on any device — where an embedded
-- signing service would add a dependency, a subscription and a per-envelope
-- cap to a flow that is already being read by hand.

create type lease_status as enum (
  -- Generated and waiting for the parties to sign it.
  'awaiting_signature',
  -- A signed copy has been sent back and is waiting on the operator.
  'submitted',
  -- Checked and countersigned. This is what takes a placement live.
  'approved',
  -- Something was wrong with the copy. The reason is on the row.
  'rejected'
);

create table leases (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null unique references requests (id) on delete cascade,

  status       lease_status not null default 'awaiting_signature',

  /*
   * The terms as they stood when the lease was generated, frozen.
   *
   * A listing's rate can change and a city's rules can be corrected, and
   * neither should quietly rewrite a document two people have signed. This is
   * what the lease page renders from once it exists, so what a party signed is
   * what everyone keeps seeing.
   */
  terms        jsonb not null,

  -- Storage path of the signed copy, in the private signed-leases bucket.
  signed_path  text,
  signed_by    uuid references profiles (id) on delete set null,
  signed_at    timestamptz,

  reviewed_by  uuid references profiles (id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- A submitted lease must actually have something attached to it.
  constraint submitted_lease_has_a_copy check (
    status <> 'submitted' or signed_path is not null
  ),
  constraint reviewed_lease_has_a_reviewer check (
    status not in ('approved', 'rejected') or reviewed_at is not null
  )
);

create index leases_status_idx on leases (status, created_at);

alter table leases enable row level security;

-- Visible to the two parties. Operators read through the service role, which
-- ignores these policies entirely.
create policy "parties read their lease" on leases
  for select using (public.viewer_is_party_to(request_id));

-- Either party may attach a signed copy to a lease that is waiting for one, or
-- replace it after a rejection. They cannot set the status: approval is the
-- operator's, and a party who could approve their own lease would make the
-- review pointless. The update policy pins every column that is not the file.
create policy "parties attach a signed copy" on leases
  for update using (
    public.viewer_is_party_to(request_id)
    and status in ('awaiting_signature', 'rejected')
  )
  with check (
    public.viewer_is_party_to(request_id)
    and status = 'submitted'
  );

create trigger leases_touch before update on leases
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Where signed copies live.
--
-- Most people will print the lease, sign it with a pen and photograph it, so
-- images are as welcome as PDFs. 25 MB because a phone photograph of four
-- pages is not small.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signed-leases',
  'signed-leases',
  false,
  26214400,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "parties upload a signed lease" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signed-leases'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "signed lease visible to both parties" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'signed-leases'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from leases le
        where le.signed_path = storage.objects.name
          and public.viewer_is_party_to(le.request_id)
      )
    )
  );

create policy "uploader replaces their own signed lease" on storage.objects
  for update to authenticated
  using (bucket_id = 'signed-leases' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'signed-leases' and (storage.foldername(name))[1] = auth.uid()::text);
