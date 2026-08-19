-- Private bucket for the sign artwork a business attaches to a placement
-- request. The homeowner has to see exactly what they are approving, so the
-- yard's owner can read it too — but nobody else can.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sign-renderings',
  'sign-renderings',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Businesses upload into a folder named for their own user id.
create policy "advertisers upload their own renderings" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sign-renderings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Readable by whoever uploaded it, and by the owner of the yard it was sent to.
create policy "rendering visible to uploader and yard owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sign-renderings'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from requests r
        join listings l on l.id = r.listing_id
        where r.rendering_path = storage.objects.name
          and l.owner_id = auth.uid()
      )
    )
  );

-- An advertiser may replace or remove their own file while a request is still
-- pending; they never touch anyone else's.
create policy "advertisers manage their own renderings" on storage.objects
  for update to authenticated
  using (bucket_id = 'sign-renderings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sign-renderings' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "advertisers delete their own renderings" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sign-renderings' and (storage.foldername(name))[1] = auth.uid()::text);
