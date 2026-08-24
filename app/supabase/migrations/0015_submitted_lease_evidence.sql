-- Fixes a constraint that blocked in-app signing.
--
-- 0013 required a submitted lease to carry an uploaded file, because at the
-- time the only way to sign was to print, sign and photograph. In-app signing
-- produces no file — the evidence is the signature rows and the moment they
-- were recorded — so both parties could sign and the agreement would sit at
-- "awaiting signature" forever, with the failing update swallowed.
--
-- What a submitted lease actually needs is evidence that somebody signed it,
-- in one form or the other.

alter table leases drop constraint submitted_lease_has_a_copy;

alter table leases add constraint submitted_lease_has_evidence check (
  status <> 'submitted' or signed_path is not null or signed_at is not null
);
