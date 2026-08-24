-- Signing in the app, instead of printing and photographing.
--
-- No e-signature vendor. DocuSeal's free plan turns out not to include API
-- access — signing programmatically is $20/month plus $0.20 a signature, even
-- self-hosted — and what those services actually sell for that money is an
-- audit trail. This records the same things: who signed, under what name, at
-- what moment, from which address and browser, having ticked a consent box
-- whose wording is stored alongside.
--
-- Whether that holds up is a legal question, not a technical one, and it goes
-- to the same attorney already reviewing the agreement. The print-and-upload
-- path stays exactly as it is, so anyone who would rather sign on paper still
-- can.

create table lease_signatures (
  id           uuid primary key default gen_random_uuid(),
  lease_id     uuid not null references leases (id) on delete cascade,
  signer_id    uuid not null references profiles (id) on delete cascade,

  -- Which side of the agreement they signed as. Resolved at signing time from
  -- the placement, never from anything the browser sends.
  party        text not null check (party in ('owner', 'advertiser')),

  -- The name they typed. This is the signature; a drawn mark, when there is
  -- one, is a picture of it.
  typed_name   text not null check (length(trim(typed_name)) > 1),
  drawn_mark   text,

  /*
   * The exact sentence they agreed to, copied in rather than referenced.
   * Consent wording changes over time and "they accepted whatever version 3
   * said" is not an answer anybody wants to give later.
   */
  consent_text text not null,

  ip           inet,
  user_agent   text,
  signed_at    timestamptz not null default now(),

  -- One signature per person per agreement. Signing again replaces nothing.
  unique (lease_id, signer_id)
);

create index lease_signatures_lease_idx on lease_signatures (lease_id);

alter table lease_signatures enable row level security;

-- Both parties see both signatures — an agreement where you cannot see who
-- else has signed is not much of an agreement.
create policy "parties read the signatures" on lease_signatures
  for select using (
    exists (
      select 1 from leases l
      where l.id = lease_signatures.lease_id
        and public.viewer_is_party_to(l.request_id)
    )
  );

/*
 * No insert policy. Signing goes through the server, which resolves which
 * party the signer is, stamps the address and the consent wording, and moves
 * the agreement on once both have signed. A browser that could write here
 * directly could sign under someone else's name.
 */
