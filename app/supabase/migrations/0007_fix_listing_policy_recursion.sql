-- Fixes an infinite recursion introduced in 0006.
--
-- The new listings policy asked "does this viewer have an approved request on
-- this listing?", which reads `requests`. The select policy on `requests` asks
-- "does this viewer own the listing?", which reads `listings`. Postgres detects
-- the loop and fails every read of either table with 42P17.
--
-- Breaking the cycle takes a security-definer function: it runs as its owner,
-- so the lookup inside it is not itself subject to row-level security, and the
-- chain terminates. It takes no user id — it asks about the caller only, so it
-- cannot be used to probe whether some other account has a placement somewhere.

create function public.viewer_has_approved_request(p_listing uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.requests r
    where r.listing_id = p_listing
      and r.requester_id = (select auth.uid())
      and r.status in ('approved', 'active', 'completed')
  );
$$;

revoke execute on function public.viewer_has_approved_request(uuid) from public;
grant execute on function public.viewer_has_approved_request(uuid) to authenticated;

drop policy "approved advertiser reads the listing" on listings;

create policy "approved advertiser reads the listing" on listings
  for select using (public.viewer_has_approved_request(id));
