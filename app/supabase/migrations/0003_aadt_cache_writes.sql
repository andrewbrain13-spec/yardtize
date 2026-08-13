-- The AADT cache is written by the listing wizard as homeowners drag the sign
-- pin. Reads stay public (listing pages show traffic to logged-out visitors),
-- but writes are limited to signed-in users so an anonymous caller cannot
-- poison the cache with fabricated traffic numbers.

create policy "signed-in users fill the aadt cache" on aadt_cache
  for insert to authenticated with check (true);

create policy "signed-in users refresh the aadt cache" on aadt_cache
  for update to authenticated using (true) with check (true);
