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
  } catch (error) {
    const e = error as { type?: string; code?: string; message?: string };
    console.error("[payments] Stripe refused a checkout session", {
      chargeId,
      type: e.type,
      code: e.code,
      message: e.message,
    });
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
  /*
   * "refused" and "failed" are kept apart because they need different words in
   * front of a person. A refusal is deterministic — Stripe looked at the
   * request and said no — and telling somebody to try again just sends them
   * round the same loop. Conflating the two cost several attempts chasing
   * timeouts that were never happening.
   */
  | { ok: false; reason: "not-configured" | "refused" | "failed" };

/**
 * Create the connected account.
 *
 * Accounts v2. Stripe now returns a hard 400 for v1 account creation on new
 * integrations — "Stripe no longer recommends Accounts v1 for new Connect
 * integrations" — and that is what was breaking this flow. An earlier attempt
 * to fix it by switching from `type: "express"` to controller properties was
 * wrong: both are v1 payloads to `/v1/accounts`, so both were refused for the
 * same reason. The endpoint was the problem, not the shape of the body.
 *
 * The Recipient configuration is the right one for this platform. Yardtize
 * charges the advertiser on its own account and transfers the homeowner's
 * share across — separate charges and transfers, with the homeowner never the
 * merchant of record. The merchant configuration would say the opposite.
 *
 * Kept to what the flow actually needs. The last round of this bug was made
 * worse by parameters nobody had asked for, so the country, the business type
 * and the payout schedule are all left for Stripe to establish during
 * onboarding, which is where the homeowner is anyway.
 */
async function createConnectedAccount(
  client: Stripe,
  email: string,
  userId: string,
): Promise<{ id: string }> {
  return client.v2.core.accounts.create({
    contact_email: email,
    // Express: Stripe hosts the onboarding and the account's own dashboard.
    dashboard: "express",
    configuration: {
      recipient: {
        capabilities: {
          // The one thing a homeowner's account has to be able to do: receive
          // a transfer of what they earned.
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    /*
     * Who carries the fees and who carries the losses. Stripe requires both to
     * be stated the moment stripe_transfers is requested — it will not infer
     * them — and for an Express dashboard both must be "application".
     *
     * That also happens to be true of this business rather than merely
     * permitted by it: Yardtize charges the advertiser on its own account and
     * transfers the homeowner's share across, so the platform is the party
     * collecting the fee and the party left holding a negative balance if a
     * payment is later reversed. A homeowner should never inherit that.
     */
    defaults: {
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    metadata: { profile_id: userId },
  });
}

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
      const account = await createConnectedAccount(client, email, userId);
      accountId = account.id;
      await admin
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", userId);
    }

    const link = await client.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          // Onboard the configuration we actually asked for.
          configurations: ["recipient"],
          /*
           * Both URLs come back to the same place. refresh_url is where Stripe
           * sends somebody whose link expired mid-way; landing them on the
           * earnings page, which offers the button again, is more use than an
           * error page explaining that a link expired.
           */
          refresh_url: `${origin}/earnings?connect=retry`,
          return_url: `${origin}/earnings?connect=done`,
        },
      },
    });

    return { ok: true, url: link.url };
  } catch (error) {
    /*
     * Say what went wrong, in the log, where an operator can read it.
     *
     * This block used to swallow the error entirely and return "failed",
     * which left the only evidence of a broken payout flow as a generic
     * sentence on a page. Diagnosing it then meant guessing between three
     * unrelated causes. Stripe's errors are specific and actionable — that
     * a platform has not completed its Connect profile, that a key lacks a
     * permission — and discarding them threw away the answer.
     *
     * It stays out of the response on purpose. Stripe's messages can name
     * account identifiers and configuration, and none of that belongs in
     * front of a homeowner who only wanted to be paid.
     */
    const e = error as {
      type?: string;
      code?: string;
      statusCode?: number;
      message?: string;
      raw?: { message?: string };
    };
    console.error("[payouts] Stripe refused Connect onboarding", {
      profileId: userId,
      // Which call failed: with no account id yet, it was accounts.create.
      stage: accountId ? "accountLinks.create" : "accounts.create",
      type: e.type,
      code: e.code,
      statusCode: e.statusCode,
      message: e.raw?.message ?? e.message,
    });

    /*
     * A 4xx means Stripe read the request and refused it. Retrying changes
     * nothing, so the caller must not invite one.
     */
    const deterministic =
      e.type === "StripeInvalidRequestError" ||
      (typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500);

    return { ok: false, reason: deterministic ? "refused" : "failed" };
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
    /*
     * A v2 account carries no `payouts_enabled` boolean. What it has is the
     * status of the capability we requested — active, pending, restricted or
     * unsupported — and only `active` means Stripe will actually accept a
     * transfer. Anything else is a homeowner who thinks they are set up and
     * would not be paid, which is precisely the lie this function exists to
     * avoid telling.
     */
    const account = await client.v2.core.accounts.retrieve(profile.stripe_account_id, {
      include: ["configuration.recipient"],
    });
    const status =
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
    const enabled = status === "active";

    if (enabled !== profile.payouts_enabled) {
      await admin.from("profiles").update({ payouts_enabled: enabled }).eq("id", userId);
    }
    return enabled;
  } catch (error) {
    const e = error as { type?: string; code?: string; message?: string };
    console.error("[payouts] couldn't read the connected account", {
      profileId: userId,
      type: e.type,
      code: e.code,
      message: e.message,
    });
    // The last known answer, which is better than claiming a status we
    // could not confirm either way.
    return profile.payouts_enabled;
  }
}

/**
 * Same write, keyed by the Stripe account id rather than by our user.
 *
 * Kept for the v1 `account.updated` webhook, which no longer fires for these
 * accounts now that they are created through v2 — v2 accounts emit their
 * events to a v2 event destination, which is separate setup nobody has done.
 * That is survivable rather than urgent: the earnings page refreshes the
 * status whenever an account is connected but not yet active, so a
 * verification that clears days later is picked up the next time the
 * homeowner looks, without any webhook at all.
 */
export async function syncAccountFromStripe(account: Stripe.Account): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  await admin
    .from("profiles")
    .update({ payouts_enabled: Boolean(account.payouts_enabled) })
    .eq("stripe_account_id", account.id);
}
