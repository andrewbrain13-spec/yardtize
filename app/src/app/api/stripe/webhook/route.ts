import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { reconcileCheckout, syncAccountFromStripe } from "@/lib/payments";

/**
 * Stripe telling us what happened, for the times nobody came back to tell us.
 *
 * The return trip from Checkout already settles the common case. This exists
 * for the cases it cannot cover: a browser closed on the confirmation page, a
 * card that clears minutes later after a bank's approval, an onboarding
 * verification that finishes days after the homeowner filled the form in.
 *
 * Every handler here calls the same functions the return trip calls, and those
 * are written to be safe to run twice — whichever arrives first wins and the
 * other writes nothing.
 *
 * Unconfigured, this returns 503 and the site carries on working. That is a
 * deliberate ordering: payments that need a webhook to be correct are a design
 * to avoid, not a dependency to accept.
 */

// The signature is computed over the exact bytes Stripe sent, so this route
// must never let a framework parse or re-encode the body first.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const client = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "unsigned" }, { status: 400 });

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await client.webhooks.constructEventAsync(body, signature, secret);
  } catch {
    /*
     * An unverified body is not a Stripe event, whatever it claims. Anyone can
     * POST here; the signature is the only thing that makes this trustworthy,
     * so a failure is refused rather than logged and processed.
     */
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      await reconcileCheckout(session.id);
      break;
    }

    case "account.updated": {
      await syncAccountFromStripe(event.data.object as Stripe.Account);
      break;
    }

    default:
      // Everything else is acknowledged and ignored. Stripe retries anything
      // it does not get a 2xx for, and retrying an event we have no handler
      // for helps nobody.
      break;
  }

  return NextResponse.json({ received: true });
}
