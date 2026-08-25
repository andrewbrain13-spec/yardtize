-- Connecting the ledger to Stripe.
--
-- 0012 gave charges a stripe_payment_intent_id, which is the right thing to
-- keep: it is the identifier a refund, a dispute or an accountant works from.
-- But a hosted Checkout session is what the advertiser actually interacts
-- with, and it exists before any payment intent does. Recording it lets a
-- return trip from Stripe find its own charge, and lets a second click on the
-- same unpaid charge resume the session it already has rather than opening a
-- second one.

alter table charges
  add column stripe_checkout_session_id text unique;

comment on column charges.stripe_checkout_session_id is
  'The hosted Checkout session opened for this charge. Present from the moment
   the advertiser starts paying; the payment intent only appears once they
   finish.';

-- A session is only worth resuming while it is still open, and Stripe expires
-- them after 24 hours. Recording when we opened it means we can tell a stale
-- session from a live one without asking Stripe on every page view.
alter table charges
  add column checkout_opened_at timestamptz;
