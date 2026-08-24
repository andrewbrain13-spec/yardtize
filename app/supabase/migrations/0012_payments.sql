-- The money: what an advertiser owes, and what Yardtize owes a homeowner.
--
-- Amounts are integer cents throughout. Dollars as floating point works right
-- up until 10% of $2,300 lands as 229.99999999999997 and the books stop
-- balancing.
--
-- Nothing here talks to Stripe. These tables are the record of what is owed
-- and what has been settled; the Stripe identifiers are columns on that record
-- rather than the record itself, so a payment provider can be replaced without
-- rewriting the ledger, and so the books survive Stripe being unreachable.

create type charge_kind   as enum ('placement', 'deposit', 'install');
create type charge_status as enum ('scheduled', 'paid', 'failed', 'refunded', 'void');
create type payout_status as enum ('scheduled', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Where a homeowner's money goes.
-- ---------------------------------------------------------------------------
alter table profiles
  add column stripe_account_id text unique,
  add column payouts_enabled   boolean not null default false;

comment on column profiles.payouts_enabled is
  'Stripe has finished onboarding this account and will accept transfers to it.';

-- ---------------------------------------------------------------------------
-- charges — what the advertiser is billed, one row per billing period.
--
-- Written when a homeowner approves a placement, so the whole schedule exists
-- up front and both sides can see what is coming. Billing is monthly in
-- advance; a twelve-month booking on the anchor corner would otherwise open
-- with a $30,860 invoice.
-- ---------------------------------------------------------------------------
create table charges (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references requests (id) on delete cascade,

  kind         charge_kind not null,
  -- What the advertiser pays.
  amount_cents integer not null check (amount_cents > 0),
  -- Yardtize's share, and the homeowner's, of that amount.
  fee_cents    integer not null default 0 check (fee_cents >= 0),
  owner_cents  integer not null default 0 check (owner_cents >= 0),

  due_on       date not null,
  period_start date not null,
  period_end   date not null,

  status       charge_status not null default 'scheduled',
  stripe_payment_intent_id text unique,
  paid_at      timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint charge_period_ordered check (period_end > period_start),

  -- A deposit is held and returned, so it belongs to neither party while it
  -- sits there. Everything else has to divide exactly between them — this is
  -- the constraint that catches a rounding bug before it reaches a payout.
  constraint charge_parts_balance check (
    kind = 'deposit' or amount_cents = fee_cents + owner_cents
  )
);

create index charges_request_idx on charges (request_id);
create index charges_due_idx on charges (status, due_on);

alter table charges enable row level security;

-- Both parties see the whole schedule, fee included. Showing a homeowner what
-- the advertiser pays and what Yardtize takes is the same transparency the
-- rate breakdown already offers; hiding it would be the odd choice.
create function public.viewer_is_party_to(p_request uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.requests r
    join public.listings l on l.id = r.listing_id
    where r.id = p_request
      and (r.requester_id = (select auth.uid()) or l.owner_id = (select auth.uid()))
  );
$$;

revoke execute on function public.viewer_is_party_to(uuid) from public;
grant execute on function public.viewer_is_party_to(uuid) to authenticated;

create policy "parties read their charges" on charges
  for select using (public.viewer_is_party_to(request_id));

-- ---------------------------------------------------------------------------
-- payouts — what Yardtize owes the homeowner, and whether it has been sent.
--
-- Separate from charges on purpose: an advertiser's payment failing and a
-- homeowner's transfer failing are different problems with different fixes,
-- and one row trying to be both would hide that.
-- ---------------------------------------------------------------------------
create table payouts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references profiles (id) on delete cascade,
  request_id   uuid not null references requests (id) on delete cascade,
  charge_id    uuid references charges (id) on delete set null,

  amount_cents integer not null check (amount_cents > 0),
  period_start date not null,
  period_end   date not null,

  status       payout_status not null default 'scheduled',
  stripe_transfer_id text unique,
  sent_at      timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index payouts_owner_idx on payouts (owner_id, status);

alter table payouts enable row level security;

create policy "owners read their payouts" on payouts
  for select using (auth.uid() = owner_id);

-- Neither table takes writes from a browser session at all: no insert, update
-- or delete policy exists, so only the service role can move money. A missing
-- policy is a denial, which is the right default for a ledger.

create trigger charges_touch before update on charges
  for each row execute function touch_updated_at();
create trigger payouts_touch before update on payouts
  for each row execute function touch_updated_at();
