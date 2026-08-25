import "server-only";

/**
 * The Stripe side of the ledger.
 *
 * Two flows live here and they are deliberately shaped the same way:
 *
 *   · an advertiser pays a charge, through Stripe's hosted Checkout page
 *   · a homeowner connects an account Stripe can pay money out to
 *
 * Both send the person to Stripe and both bring them back to a URL we chose.
 * Neither depends on a webhook to finish. That is the important design
 * decision in this file: the return trip reconciles against Stripe directly,
 * asking Stripe what actually happened rather than trusting the redirect or
 * waiting for a callback. A webhook is added on top for the cases the return
 * trip misses — a closed laptop, a card that needs a bank's approval minutes
 * later — but nothing here is broken while the webhook is unconfigured.
 *
 * Money is never inferred from a redirect. `?paid=…` proves the browser came
 * back from Stripe and nothing more; a person can type that URL. Every path
 * below re-reads the truth from Stripe's API before writing 'paid' anywhere.
 */

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Stripe expires a hosted Checkout session 24 hours after it is created. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type CheckoutStart =
  | { ok: true; url: string }
  | { ok: false; reason: "not-configured" | "not-yours" | "already-paid" | "failed" };

const CHARGE_DESCRIPTION: Record<string, string> = {
  placement: "Yard sign placement",
  deposit: "Refundable sign deposit",
  install: "Professional install and removal",
};

/**
 * Open a Checkout session for one charge and hand back the URL to send the
 * advertiser to.
 *
 * Only the advertiser on the placement may pay it. That check is done here
 * against the ledger rather than trusted from the caller, because this
 * function is the thing that can move money.
 */
export async function startCheckout(
  chargeId: string,
  userId: string,
  origin: string,
): Promise<CheckoutStart> {
  const client = stripe();
  const admin = createAdminClient();
  if (!client || !admin) return { ok: false, reason: "not-configured" };

  const { data: charge } = await admin
    .from("charges")
    .select("*")
    .eq("id", chargeId)
    .maybeSingle();
  if (!charge) return { ok: false, reason: "not-yours" };

  const { data: request } = await admin
    .from("requests")
    .select("id, requester_id, listing_id")
    .eq("id", charge.request_id)
    .maybeSingle();
  if (!request || request.requester_id !== userId) return { ok: false, reason: "not-yours" };

  if (charge.status === "paid") return { ok: false, reason: "already-paid" };
  if (charge.status !== "scheduled" && charge.status !== "failed") {
    return { ok: false, reason: "not-yours" };
  }

  /*
   * Resume rather than reopen. Somebody who clicks pay, thinks better of it,
   * and clicks again an hour later should land on the session they already
   * have — two live sessions against one charge is how a charge gets paid
   * twice.
   */
  if (charge.stripe_checkout_session_id && charge.checkout_opened_at) {
    const age = Date.now() - new Date(charge.checkout_opened_at).getTime();
    if (age < SESSION_TTL_MS) {
      try {
        const existing = await client.checkout.sessions.retrieve(
          charge.stripe_checkout_session_id,
        );
        if (existing.status === "open" && existing.url) {
          return { ok: true, url: existing.url };
        }
      } catch {
        /* Gone or unreadable — fall through and open a fresh one. */
      }
    }
  }

  /*
   * City and state only. The street address is deliberately not read here —
   * it would end up on a Stripe receipt and in the advertiser's card
   * statement, and which yard it is stays between the two parties.
   */
  const { data: listing } = await admin
    .from("listings")
    .select("city, state")
    .eq("id", request.listing_id)
    .maybeSingle();

  const where = listing ? `${listing.city}, ${listing.state}` : "Kansas City metro";
  const label = CHARGE_DESCRIPTION[charge.kind] ?? "Yardtize placement";

  try {
    const session = await client.checkout.sessions.create({
      mode: "payment",
      /*
       * The charge id rides along in metadata so the webhook can find its way
       * back to the ledger row without parsing a URL. client_reference_id
       * carries it too — Stripe surfaces that one in the dashboard, which is
       * what somebody reconciling by hand will actually be looking at.
       */
      client_reference_id: charge.id,
      metadata: { charge_id: charge.id, request_id: charge.request_id },
      payment_intent_data: {
        metadata: { charge_id: charge.id, request_id: charge.request_id },
        description: `${label} — ${where}`,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: charge.amount_cents,
            product_data: {
              name: label,
              description:
                charge.kind === "deposit"
                  ? "Held and returned when the sign comes down undamaged."
                  : `${where} · ${charge.period_start} to ${charge.period_end}`,
            },
          },
        },
      ],
      success_url: `${origin}/placements/${charge.request_id}?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/placements/${charge.request_id}`,
    });

    if (!session.url) return { ok: false, reason: "failed" };

    await admin
      .from("charges")
      .update({
        stripe_checkout_session_id: session.id,
        checkout_opened_at: new Date().toISOString(),
      })
      .eq("id", charge.id);

    return { ok: true, url: session.url };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Settle a charge from a Checkout session, whatever brought us here.
 *
 * Called on the return trip and again from the webhook. Both paths run this
 * same function, which is why it must be safe to run twice: the update is
 * conditioned on the charge not already being paid, so the second caller
 * writes nothing and reports the same answer as the first.
 */
export async function reconcileCheckout(sessionId: string): Promise<"paid" | "unpaid" | "unknown"> {
  const client = stripe();
  const admin = createAdminClient();
  if (!client || !admin) return "unknown";

  let session: Stripe.Checkout.Session;
  try {
    session = await client.checkout.sessions.retrieve(sessionId);
  } catch {
    return "unknown";
  }

  const chargeId = session.metadata?.charge_id ?? session.client_reference_id;
  if (!chargeId) return "unknown";

  if (session.payment_status !== "paid") return "unpaid";

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data: updated } = await admin
    .from("charges")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", chargeId)
    .neq("status", "paid")
    .select("id");

  /*
   * Nothing updated means it was already paid — the webhook and the return
   * trip racing each other, which is the expected case rather than a fault.
   */
  void updated;
  return "paid";
}

// ---------------------------------------------------------------------------
// Homeowner payouts
// ---------------------------------------------------------------------------

export type OnboardingStart =
  | { ok: true; url: string }
  | { ok: false; reason: "not-configured" | "failed" };

/**
 * Send a homeowner to Stripe to set up where their money lands.
 *
 * Express accounts are the right shape here: Stripe hosts the onboarding, does
 * the identity and bank verification, and owns the compliance burden that
 * comes with paying out to individuals in fifty states. Yardtize never sees a
 * bank account number, which is the point.
 */
export async function startPayoutOnboarding(
  userId: string,
  email: string,
  origin: string,
): Promise<OnboardingStart> {
  const client = stripe();
  const admin = createAdminClient();
  if (!client || !admin) return { ok: false, reason: "not-configured" };

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", userId)
    .maybeSingle();

  let accountId = profile?.stripe_account_id ?? null;

  try {
    if (!accountId) {
      const account = await client.accounts.create({
        type: "express",
        email,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { profile_id: userId },
        settings: {
          payouts: {
            // Stripe's default. Stated rather than assumed, because how fast a
            // homeowner sees their money is a product decision, not a default.
            schedule: { interval: "daily", delay_days: "minimum" },
          },
        },
      });
      accountId = account.id;
      await admin
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", userId);
    }

    const link = await client.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      /*
       * Both URLs come back to the same place. refresh_url is where Stripe
       * sends somebody whose link expired mid-way; landing them on the
       * earnings page, which offers the button again, is more use than an
       * error page explaining that a link expired.
       */
      refresh_url: `${origin}/earnings?connect=retry`,
      return_url: `${origin}/earnings?connect=done`,
    });

    return { ok: true, url: link.url };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Ask Stripe whether this homeowner can actually be paid, and write the answer
 * down.
 *
 * `payouts_enabled` is Stripe's own verdict, not a guess from how far through
 * onboarding somebody got. Somebody can finish every screen and still be held
 * for verification, and telling them they are connected when Stripe would
 * refuse the transfer is the kind of lie that surfaces on payday.
 */
export async function refreshPayoutStatus(userId: string): Promise<boolean> {
  const client = stripe();
  const admin = createAdminClient();
  if (!client || !admin) return false;

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id, payouts_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.stripe_account_id) return false;

  try {
    const account = await client.accounts.retrieve(profile.stripe_account_id);
    const enabled = Boolean(account.payouts_enabled);
    if (enabled !== profile.payouts_enabled) {
      await admin.from("profiles").update({ payouts_enabled: enabled }).eq("id", userId);
    }
    return enabled;
  } catch {
    return profile.payouts_enabled;
  }
}

/** Same write, keyed by the Stripe account — the shape a webhook arrives in. */
export async function syncAccountFromStripe(account: Stripe.Account): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  await admin
    .from("profiles")
    .update({ payouts_enabled: Boolean(account.payouts_enabled) })
    .eq("stripe_account_id", account.id);
}
