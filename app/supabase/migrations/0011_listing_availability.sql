-- When a yard is taken, without saying who took it.
--
-- Row-level security on `requests` shows a row only to the advertiser who sent
-- it and the homeowner who owns the yard — which is right, and which means a
-- browsing advertiser cannot see that a corner is already booked. Availability
-- is public information in a marketplace; who booked it is not.
--
-- A security-definer view, like listings_public: it sees past the policy, and
-- the column list is the boundary. Dates and the listing, nothing else — no
-- advertiser, no name, no rate.
create view listing_availability as
select
  r.listing_id,
  r.starts_on,
  r.ends_on
from requests r
where r.status in ('approved', 'active')
  and r.ends_on >= current_date;

grant select on listing_availability to anon, authenticated;
