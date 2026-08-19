-- The advertiser may edit their own request while it is still pending — the
-- message, the artwork — but they must not be able to move it along.
--
-- The previous policy checked only that the row still belonged to them, so an
-- advertiser could have set their own pending request to 'approved' and
-- skipped the homeowner entirely. Pinning the status in the WITH CHECK keeps
-- the decision where it belongs.

drop policy if exists "requester updates own pending request" on requests;

create policy "requester edits own pending request" on requests
  for update
  using (auth.uid() = requester_id and status = 'requested')
  with check (auth.uid() = requester_id and status = 'requested');
