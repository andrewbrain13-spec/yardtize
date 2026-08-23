import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailResult } from "@/lib/email";
import { ELECTION_WINDOW_MONTHS } from "@/lib/booking";
import { money } from "@/lib/money";

/**
 * The two moments in a placement that happen while the other party is not
 * looking at the site: a request arriving in a homeowner's inbox, and the
 * homeowner's answer to it.
 *
 * Both read an address belonging to someone other than the signed-in user, so
 * both go through the service-role client — see supabase/admin.ts.
 *
 * Neither ever throws. A notification failing is a thing to fix, not a reason
 * to fail the booking that triggered it.
 */

const NOT_CONFIGURED: EmailResult = { sent: false, reason: "not-configured" };

const term = (months: number | null, election: boolean) =>
  election
    ? "the election window (Sep 19 – Nov 5)"
    : `${months} month${months === 1 ? "" : "s"}`;

/** Tells the homeowner an advertiser has asked for their yard. */
export async function notifyOwnerOfRequest(requestId: string, origin: string): Promise<EmailResult> {
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;

  const { data: request } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { sent: false, reason: "failed", detail: "request not found" };

  const { data: listing } = await admin
    .from("listings")
    .select("owner_id, headline, city, monthly_rate")
    .eq("id", request.listing_id)
    .maybeSingle();
  if (!listing) return { sent: false, reason: "failed", detail: "listing not found" };

  const { data: owner } = await admin
    .from("profiles")
    .select("email")
    .eq("id", listing.owner_id)
    .maybeSingle();
  if (!owner?.email) return { sent: false, reason: "failed", detail: "owner has no email" };

  const months = request.is_election_window
    ? ELECTION_WINDOW_MONTHS
    : (request.duration_months ?? 1);
  const yard = listing.headline ?? `your ${listing.city} yard`;

  return sendEmail({
    to: owner.email,
    subject: `${request.advertiser_name} wants to advertise on ${yard}`,
    heading: `You have a placement request`,
    body: [
      `${request.advertiser_name} asked to put one sign on ${yard}.`,
      `${request.sign_size_label} · ${term(request.duration_months, request.is_election_window)} · ` +
        `${money((listing.monthly_rate ?? 0) * months)} to you over the term.`,
      request.message
        ? `They wrote: "${request.message}"`
        : `They didn't leave a message.`,
      `Nothing goes in your yard until you say yes. Review their artwork and decide when you're ready.`,
    ],
    action: { label: "Review the request", url: `${origin}/inbox` },
    footnote: "One sign per yard, always. You can decline for any reason.",
  });
}

/** Tells the advertiser what the homeowner decided. */
export async function notifyRequesterOfDecision(
  requestId: string,
  decision: "approved" | "declined",
  origin: string,
): Promise<EmailResult> {
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;

  const { data: request } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { sent: false, reason: "failed", detail: "request not found" };

  const { data: listing } = await admin
    .from("listings")
    .select("headline, city, state, monthly_rate")
    .eq("id", request.listing_id)
    .maybeSingle();

  const { data: requester } = await admin
    .from("profiles")
    .select("email")
    .eq("id", request.requester_id)
    .maybeSingle();
  if (!requester?.email) return { sent: false, reason: "failed", detail: "requester has no email" };

  const yard = listing?.headline ?? `the ${listing?.city ?? "Kansas City"} yard`;

  if (decision === "declined") {
    return sendEmail({
      to: requester.email,
      subject: `Your request for ${yard} wasn't accepted`,
      heading: "That homeowner passed",
      body: [
        `The owner of ${yard} declined your placement request. Homeowners can decline for any reason, and it isn't a mark against your account.`,
        `There are other yards on the same roads. Traffic counts and rates are on every listing, so you can compare before you ask again.`,
      ],
      action: { label: "Find another yard", url: `${origin}/browse` },
    });
  }

  const months = request.is_election_window
    ? ELECTION_WINDOW_MONTHS
    : (request.duration_months ?? 1);

  return sendEmail({
    to: requester.email,
    subject: `Approved: ${yard}`,
    heading: "Your placement was approved",
    body: [
      `The owner of ${yard} approved your request. ${request.sign_size_label}, ${term(request.duration_months, request.is_election_window)}.`,
      `Agreed rate: ${money(listing?.monthly_rate ?? 0)} per month, ${money((listing?.monthly_rate ?? 0) * months)} over the term.`,
      request.install === "self"
        ? `You're installing and removing the sign yourself, with a $500 refundable deposit held against damage to the yard.`
        : `Yardtize's crew handles install and removal at $99 each way.`,
      `Yardtize isn't collecting payment yet — you and the homeowner settle directly. The placement summary below has the full address and the terms both of you agreed to.`,
    ],
    action: { label: "Open the placement summary", url: `${origin}/agreement/${requestId}` },
    footnote:
      "Yardtize takes any sign down within 48 hours of a complaint from the city or the homeowner.",
  });
}
