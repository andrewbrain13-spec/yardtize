-- Money going out: what was actually settled, and why anything wasn't.
--
-- 0012 wrote payouts as intentions — one row per billing period, the amount
-- the homeowner is owed if the placement runs its course. Settling one is a
-- different fact: how many days the sign really stood, what was therefore
-- transferred, and, when nothing moved, the reason. A row that only carries
-- 'failed' tells an operator a payout needs attention but not what to do
-- about it, which is the difference between a status and an answer.

-- A payout can also come to nothing legitimately: a sign that never went up,
-- or came down before the period began, owes the homeowner nothing for that
-- period. That is not a failure and should not sit in a queue looking like one.
alter type payout_status add value if not exists 'void';

alter table payouts
  -- What was actually sent, which is prorated and so is usually less than
  -- amount_cents. Kept separate rather than overwriting the intention: the
  -- gap between the two is the record of a sign that came down early.
  add column settled_cents  integer check (settled_cents >= 0),
  add column days_stood     integer check (days_stood >= 0),
  add column days_in_period integer check (days_in_period > 0),
  add column attempted_at   timestamptz,
  add column detail         text;

comment on column payouts.settled_cents is
  'What actually moved. Null until settlement; 0 on a void payout.';
comment on column payouts.detail is
  'Why this payout is where it is — the reason a transfer failed, or why
   nothing was owed. Written for an operator to read, not parsed.';

-- ---------------------------------------------------------------------------
-- Refunding the deposit.
-- ---------------------------------------------------------------------------
alter table charges
  add column stripe_refund_id text unique,
  add column refunded_at      timestamptz;

-- The deposit is returned when the sign comes down undamaged. "Undamaged" is
-- a judgement nobody has made automatically, so the platform waits a settling
-- period after removal and then returns it — unless an operator has said not
-- to, in writing, here. Silence returns the money; that is the right default
-- for somebody else's $500.
alter table requests
  add column deposit_hold_reason text;

comment on column requests.deposit_hold_reason is
  'Set by an operator to stop the automatic deposit refund. The text is shown
   to both parties, so it has to be a reason, not a flag.';

-- ---------------------------------------------------------------------------
-- Both parties should be able to see a deposit hold, since it is their money
-- and their yard. The existing request policies already scope requests to the
-- two parties, so no new policy is needed — this is a column on a table they
-- can already read.
-- ---------------------------------------------------------------------------

create index payouts_due_idx on payouts (status, period_end);
create index charges_refund_idx on charges (kind, status) where kind = 'deposit';
