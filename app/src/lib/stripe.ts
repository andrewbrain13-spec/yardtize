import "server-only";

/**
 * Stripe, when it is connected.
 *
 * Absent a key this returns null and every caller renders the "payments aren't
 * running yet" state — the same shape as the Resend integration, and for the
 * same reason: a deployment without the key should still serve the site rather
 * than fall over.
 *
 * Test keys begin `sk_test_`. Nothing here distinguishes test from live on
 * purpose: the flow is identical, and the difference belongs in which key the
 * deployment holds, not in branching code that behaves one way in testing.
 */

import Stripe from "stripe";

let cached: Stripe | null | undefined;

export function stripe(): Stripe | null {
  if (cached !== undefined) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  cached = key
    ? new Stripe(key, {
        // Pinned so a Stripe-side upgrade cannot change behaviour under us.
        apiVersion: "2026-07-29.dahlia",
        appInfo: { name: "Yardtize", url: "https://www.yardtize.com" },
      })
    : null;

  return cached;
}

/** True when this deployment can actually move money. */
export const paymentsEnabled = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

/** Test keys carry the word. Used to badge the interface, never to branch logic. */
export const inTestMode = (): boolean =>
  (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
