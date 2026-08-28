import "server-only";

/**
 * Money leaving the platform.
 *
 * Two things happen here, both on a schedule and neither on a click:
 * a homeowner is paid for the days their sign stood, and an advertiser's
 * deposit is returned once the sign is down and nobody has claimed damage.
 *
 * The safety valve worth explaining: this runs as a dry run unless
 * PAYOUTS_LIVE is set. A dry run does every lookup, every eligibility check
 * and every calculation, and writes nothing and sends nothing — it reports
 * exactly what it would have done. Outbound payments are the one thing on
 * this platform that cannot be undone by editing a row, and they were built
 * against a Stripe account this code has never authenticated to. Reading a
 * dry run before switching it live costs a minute; getting a transfer wrong
 * costs somebody else's money.
 *
 * Ordering is the other deliberate choice. The advertiser pays monthly in
 * advance, the homeowner is settled monthly in arrears. The gap is not float
 * for its own sake: it is what makes a sign coming down on day three a
 * proration rather than a clawback.
 */

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { settle, depositDue } from "@/lib/settlement";
import { today } from "@/lib/scheduling";
import { formatCents } from "@/lib/billing";

/** True only when this deployment is meant to actually move money. */
export const payoutsLive = (): boolean => process.env.PAYOUTS_LIVE === "1";

export type PayoutOutcome = {
  payoutId: string;
  requestId: string;
  yard: string;
  period: string;
  /** What was scheduled, before proration. */
  scheduledCents: number;
  /** What this run settled on, prorated for days stood. */
  settledCents: number;
  action: "sent" | "would send" | "void" | "waiting" | "blocked" | "failed";
  detail: string;
};

export type DepositOutcome = {
  chargeId: string;
  requestId: string;
  yard: string;
  amountCents: number;
  action: "refunded" | "would refund" | "waiting" | "held" | "failed";
  detail: string;
  /** The operator's hold, if there is one, so the screen can offer to lift it. */
  heldReason: string | null;
};

export type PayoutRun = {
  live: boolean;
  asOf: string;
  payouts: PayoutOutcome[];
  deposits: DepositOutcome[];
  /** What actually moved, or would have. */
  totalOutCents: number;
};

const EMPTY = (live: boolean, asOf: string): PayoutRun => ({
  live,
  asOf,
  payouts: [],
  deposits: [],
  totalOutCents: 0,
});

/**
 * The Stripe charge behind a payment intent.
 *
 * Transfers name their funding charge through source_transaction, which is
 * what lets a transfer succeed on the money that specific payment brought in
 * rather than waiting for a platform balance to settle. Without it a transfer
 * on a fresh account fails for insufficient funds even though the advertiser
 * paid an hour ago.
 */
async function fundingChargeId(
  client: Stripe,
  paymentIntentId: string | null,
): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const intent = await client.paymentIntents.retrieve(paymentIntentId);
    const latest = intent.latest_charge;
    return typeof latest === "string" ? latest : (latest?.id ?? null);
  } catch {
    return null;
  }
}

export async function runPayouts(options?: { asOf?: string; live?: boolean }): Promise<PayoutRun> {
  const asOf = options?.asOf ?? today();
  const live = options?.live ?? payoutsLive();

  const admin = createAdminClient();
  const client = stripe();
  if (!admin) return EMPTY(live, asOf);

  const run = EMPTY(live, asOf);

  // -------------------------------------------------------------------------
  // Homeowner payouts
  // -------------------------------------------------------------------------
  const { data: dueRows } = await admin
    .from("payouts")
    .select("*")
    .eq("status", "scheduled")
    .lte("period_end", asOf)
    .order("period_end");

  for (const payout of dueRows ?? []) {
    const [{ data: request }, { data: owner }, { data: charge }] = await Promise.all([
      admin
        .from("requests")
        .select("id, listing_id, installed_at, removed_at, advertiser_name")
        .eq("id", payout.request_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, stripe_account_id, payouts_enabled")
        .eq("id", payout.owner_id)
        .maybeSingle(),
      payout.charge_id
        ? admin
            .from("charges")
            .select("id, status, stripe_payment_intent_id")
            .eq("id", payout.charge_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const { data: listing } = request
      ? await admin
          .from("listings")
          .select("headline, city")
          .eq("id", request.listing_id)
          .maybeSingle()
      : { data: null };

    const yard = listing?.headline ?? listing?.city ?? "a yard";
    const period = `${payout.period_start} to ${payout.period_end}`;
    const base = {
      payoutId: payout.id as string,
      requestId: payout.request_id as string,
      yard,
      period,
      scheduledCents: payout.amount_cents as number,
      settledCents: 0,
    };

    if (!request) {
      run.payouts.push({ ...base, action: "failed", detail: "the placement is missing" });
      continue;
    }

    /*
     * Nothing is paid out of money that never came in. This is the check that
     * keeps the platform from funding a homeowner from its own pocket when an
     * advertiser's card failed.
     */
    if (!charge || charge.status !== "paid") {
      run.payouts.push({
        ...base,
        action: "waiting",
        detail: "the advertiser has not paid for this period yet",
      });
      continue;
    }

    const verdict = settle({
      periodStart: payout.period_start,
      periodEnd: payout.period_end,
      scheduledCents: payout.amount_cents,
      installedOn: request.installed_at ? request.installed_at.slice(0, 10) : null,
      removedOn: request.removed_at ? request.removed_at.slice(0, 10) : null,
      asOf,
    });

    if (verdict.status === "not due") {
      run.payouts.push({ ...base, action: "waiting", detail: verdict.reason });
      continue;
    }

    if (verdict.status === "void") {
      if (live) {
        await admin
          .from("payouts")
          .update({
            status: "void",
            settled_cents: 0,
            days_stood: 0,
            days_in_period: verdict.daysInPeriod,
            attempted_at: new Date().toISOString(),
            detail: verdict.reason,
          })
          .eq("id", payout.id);
      }
      run.payouts.push({ ...base, action: "void", detail: verdict.reason });
      continue;
    }

    // Due. Can this homeowner actually receive it?
    if (!owner?.stripe_account_id || !owner.payouts_enabled) {
      run.payouts.push({
        ...base,
        settledCents: verdict.cents,
        action: "blocked",
        detail: owner?.stripe_account_id
          ? "Stripe has not finished verifying their account"
          : "the homeowner has not connected an account to be paid into",
      });
      continue;
    }

    const detail =
      verdict.daysStood === verdict.daysInPeriod
        ? `${verdict.daysStood} days, the full period`
        : `${verdict.daysStood} of ${verdict.daysInPeriod} days — prorated`;

    if (!live || !client) {
      run.payouts.push({
        ...base,
        settledCents: verdict.cents,
        action: "would send",
        detail,
      });
      run.totalOutCents += verdict.cents;
      continue;
    }

    try {
      const source = await fundingChargeId(client, charge.stripe_payment_intent_id);
      const transfer = await client.transfers.create({
        amount: verdict.cents,
        currency: "usd",
        destination: owner.stripe_account_id,
        ...(source ? { source_transaction: source } : {}),
        description: `${yard} · ${period}`,
        metadata: {
          payout_id: payout.id,
          request_id: payout.request_id,
          days_stood: String(verdict.daysStood),
        },
      });

      await admin
        .from("payouts")
        .update({
          status: "sent",
          settled_cents: verdict.cents,
          days_stood: verdict.daysStood,
          days_in_period: verdict.daysInPeriod,
          stripe_transfer_id: transfer.id,
          sent_at: new Date().toISOString(),
          attempted_at: new Date().toISOString(),
          detail,
        })
        .eq("id", payout.id);

      run.payouts.push({ ...base, settledCents: verdict.cents, action: "sent", detail });
      run.totalOutCents += verdict.cents;
    } catch (error) {
      const message = (error as { message?: string }).message ?? "Stripe refused the transfer";
      /*
       * Left as 'scheduled' rather than marked failed, so the next run tries
       * again. A transfer that failed because a balance had not settled is the
       * common case and fixes itself; one that keeps failing shows up in the
       * operator's list with Stripe's own words attached.
       */
      await admin
        .from("payouts")
        .update({ attempted_at: new Date().toISOString(), detail: message })
        .eq("id", payout.id);
      run.payouts.push({ ...base, settledCents: verdict.cents, action: "failed", detail: message });
    }
  }

  // -------------------------------------------------------------------------
  // Deposits going back
  // -------------------------------------------------------------------------
  const { data: deposits } = await admin
    .from("charges")
    .select("*")
    .eq("kind", "deposit")
    .eq("status", "paid");

  for (const deposit of deposits ?? []) {
    const { data: request } = await admin
      .from("requests")
      .select("id, listing_id, removed_at, deposit_hold_reason")
      .eq("id", deposit.request_id)
      .maybeSingle();
    if (!request) continue;

    const { data: listing } = await admin
      .from("listings")
      .select("headline, city")
      .eq("id", request.listing_id)
      .maybeSingle();

    const base = {
      chargeId: deposit.id as string,
      requestId: deposit.request_id as string,
      yard: listing?.headline ?? listing?.city ?? "a yard",
      amountCents: deposit.amount_cents as number,
      heldReason: (request.deposit_hold_reason as string | null) ?? null,
    };

    const verdict = depositDue({
      removedOn: request.removed_at ? request.removed_at.slice(0, 10) : null,
      holdReason: request.deposit_hold_reason,
      asOf,
    });

    if (verdict.status === "wait") {
      run.deposits.push({ ...base, action: "waiting", detail: verdict.reason });
      continue;
    }
    if (verdict.status === "held") {
      run.deposits.push({ ...base, action: "held", detail: verdict.reason });
      continue;
    }

    if (!live || !client) {
      run.deposits.push({
        ...base,
        action: "would refund",
        detail: "the sign is down and nobody has claimed damage",
      });
      run.totalOutCents += deposit.amount_cents;
      continue;
    }

    try {
      if (!deposit.stripe_payment_intent_id) throw new Error("no payment on file to refund");
      const refund = await client.refunds.create({
        payment_intent: deposit.stripe_payment_intent_id,
        metadata: { charge_id: deposit.id, request_id: deposit.request_id },
      });
      await admin
        .from("charges")
        .update({
          status: "refunded",
          stripe_refund_id: refund.id,
          refunded_at: new Date().toISOString(),
        })
        .eq("id", deposit.id);
      run.deposits.push({
        ...base,
        action: "refunded",
        detail: "returned in full",
      });
      run.totalOutCents += deposit.amount_cents;
    } catch (error) {
      const message = (error as { message?: string }).message ?? "Stripe refused the refund";
      run.deposits.push({ ...base, action: "failed", detail: message });
    }
  }

  return run;
}

/** A one-line summary for a cron log or an operator's screen. */
export function describeRun(run: PayoutRun): string {
  const sent = run.payouts.filter((p) => p.action === "sent" || p.action === "would send").length;
  const blocked = run.payouts.filter((p) => p.action === "blocked").length;
  const refunds = run.deposits.filter(
    (d) => d.action === "refunded" || d.action === "would refund",
  ).length;

  const parts = [
    `${sent} payout${sent === 1 ? "" : "s"}`,
    `${refunds} deposit refund${refunds === 1 ? "" : "s"}`,
    formatCents(run.totalOutCents),
  ];
  if (blocked > 0) parts.push(`${blocked} blocked`);
  return `${run.live ? "sent" : "dry run"}: ${parts.join(", ")}`;
}
