import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailResult } from "@/lib/email";
import { ELECTION_WINDOW_MONTHS } from "@/lib/booking";
import { money } from "@/lib/money";
import { describeTerm } from "@/lib/scheduling";

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

/** Both parties, when an agreement is ready to sign. */
export async function notifyLeaseReady(requestId: string, origin: string): Promise<EmailResult> {
  const parties = await partiesFor(requestId);
  if (!parties) return { sent: false, reason: "failed", detail: "parties not found" };

  const { owner, advertiser, term, yard } = parties;
  const results = await Promise.all(
    [owner, advertiser].map((to) =>
      sendEmail({
        to,
        subject: `Agreement ready to sign — ${yard}`,
        heading: "Your placement agreement is ready",
        body: [
          `${advertiser === to ? "The homeowner approved your request" : "You approved this placement"}, so the agreement is drawn up: ${yard}, ${term}.`,
          `Print it, both of you sign it — pen and paper, or any e-signing tool you like — then send a copy back through the link below.`,
          `Yardtize checks the signatures and confirms. Nothing goes in the ground until then.`,
        ],
        action: { label: "Open the agreement", url: `${origin}/agreement/${requestId}` },
      }),
    ),
  );
  return results.find((r) => !r.sent) ?? { sent: true };
}

/** The operator, when a signed copy needs checking. */
export async function notifyOperatorOfSignedLease(
  requestId: string,
  origin: string,
): Promise<EmailResult> {
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;

  const { data: operators } = await admin
    .from("profiles")
    .select("email")
    .eq("is_admin", true);

  const parties = await partiesFor(requestId);
  if (!parties || !operators?.length) {
    return { sent: false, reason: "failed", detail: "no operator to notify" };
  }

  const results = await Promise.all(
    operators
      .filter((o) => o.email)
      .map((o) =>
        sendEmail({
          to: o.email,
          subject: `Signed agreement to check — ${parties.yard}`,
          heading: "A signed agreement is waiting",
          body: [
            `${parties.advertiserName} and the owner of ${parties.yard} have sent back a signed copy for ${parties.term}.`,
            `Check that both parties signed and that it matches the terms. Confirming is what takes the placement live.`,
          ],
          action: { label: "Review it", url: `${origin}/admin/leases` },
        }),
      ),
  );
  return results.find((r) => !r.sent) ?? { sent: true };
}

/** Both parties, once an agreement is confirmed or sent back. */
export async function notifyLeaseReviewed(
  requestId: string,
  approved: boolean,
  note: string | null,
  origin: string,
): Promise<EmailResult> {
  const parties = await partiesFor(requestId);
  if (!parties) return { sent: false, reason: "failed", detail: "parties not found" };

  const { owner, advertiser, term, yard } = parties;
  const results = await Promise.all(
    [owner, advertiser].map((to) =>
      sendEmail({
        to,
        subject: approved
          ? `Confirmed — the placement is live at ${yard}`
          : `Your signed agreement needs another look — ${yard}`,
        heading: approved ? "The placement is live" : "We sent the agreement back",
        body: approved
          ? [
              `Yardtize has checked the signatures on ${yard}. The placement runs ${term}.`,
              `The sign can go up on the start date. If anyone objects to it — the city, an HOA, or the homeowner — it comes down within 48 hours, no questions asked.`,
            ]
          : [
              `Something wasn't right with the signed copy for ${yard}.`,
              note ?? "Have another look at the agreement and send a fresh copy.",
              `Nothing is lost — send a corrected copy through the same link.`,
            ],
        action: { label: "Open the agreement", url: `${origin}/agreement/${requestId}` },
      }),
    ),
  );
  return results.find((r) => !r.sent) ?? { sent: true };
}

/**
 * The two email addresses on a placement, plus the bits every lease email
 * needs. Reads across accounts, so it goes through the service role.
 */
async function partiesFor(requestId: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: request } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return null;

  const { data: listing } = await admin
    .from("listings")
    .select("owner_id, headline, city")
    .eq("id", request.listing_id)
    .maybeSingle();
  if (!listing) return null;

  const [{ data: ownerProfile }, { data: advertiserProfile }] = await Promise.all([
    admin.from("profiles").select("email").eq("id", listing.owner_id).maybeSingle(),
    admin.from("profiles").select("email").eq("id", request.requester_id).maybeSingle(),
  ]);

  if (!ownerProfile?.email || !advertiserProfile?.email) return null;

  return {
    owner: ownerProfile.email,
    advertiser: advertiserProfile.email,
    advertiserName: request.advertiser_name,
    yard: listing.headline ?? `the ${listing.city} yard`,
    term: describeTerm({ startsOn: request.starts_on, endsOn: request.ends_on }),
  };
}

/**
 * Something happened to a live placement.
 *
 * One function rather than three, because the audience is always the same two
 * people and the difference between the messages is a sentence. A takedown
 * also reaches the operator, since the 48-hour clock is Yardtize's promise to
 * keep, not the parties'.
 */
export async function notifyPlacementEvent(
  requestId: string,
  kind: "installed" | "takedown_requested" | "removed",
  note: string | null,
  origin: string,
): Promise<EmailResult> {
  const parties = await partiesFor(requestId);
  if (!parties) return { sent: false, reason: "failed", detail: "parties not found" };

  const { owner, advertiser, yard, term } = parties;
  const url = `${origin}/placements/${requestId}`;

  const message = {
    installed: {
      subject: `The sign is up at ${yard}`,
      heading: "The sign is in the ground",
      body: [
        `${yard} is live. The placement runs ${term}.`,
        `Delivery is counting from today, and you can see it accruing on the placement page.`,
      ],
      label: "See the placement",
    },
    takedown_requested: {
      subject: `Takedown requested — ${yard}`,
      heading: "This sign comes down within 48 hours",
      body: [
        `A takedown has been requested for ${yard}.`,
        note ?? `The property owner asked for it, which under the agreement needs no reason.`,
        `The sign comes down within 48 hours. Rent is prorated to the day it is removed, and neither party owes the other anything further.`,
      ],
      label: "Open the placement",
    },
    removed: {
      subject: `Removed — ${yard}`,
      heading: "The sign is out of the ground",
      body: [
        `${yard} is finished. Thanks — the ground goes back as it was found.`,
        `The final delivery figures are on the placement page, and any refundable deposit is returned within 14 days.`,
      ],
      label: "See the final report",
    },
  }[kind];

  const audience = [owner, advertiser];
  if (kind === "takedown_requested") {
    const admin = createAdminClient();
    const { data: operators } = admin
      ? await admin.from("profiles").select("email").eq("is_admin", true)
      : { data: [] };
    for (const operator of operators ?? []) {
      if (operator.email && !audience.includes(operator.email)) audience.push(operator.email);
    }
  }

  const results = await Promise.all(
    audience.map((to) =>
      sendEmail({
        to,
        subject: message.subject,
        heading: message.heading,
        body: message.body,
        action: { label: message.label, url },
      }),
    ),
  );
  return results.find((r) => !r.sent) ?? { sent: true };
}

/** The daily job's three nudges. */
export async function notifyPlacementReminder(
  requestId: string,
  kind: "install-due" | "ending-soon" | "removal-due",
  origin: string,
): Promise<EmailResult> {
  const parties = await partiesFor(requestId);
  if (!parties) return { sent: false, reason: "failed", detail: "parties not found" };

  const { owner, advertiser, yard, term } = parties;
  const url = `${origin}/placements/${requestId}`;

  const message = {
    "install-due": {
      subject: `The sign goes up at ${yard} tomorrow`,
      heading: "Installation is due",
      body: [
        `${yard} starts tomorrow. Once the sign is in the ground, confirm it on the placement page — a photo is worth adding.`,
        `That confirmation is what an advertiser sees as proof, and what Yardtize points to if a city ever asks.`,
      ],
      label: "Confirm the install",
    },
    "ending-soon": {
      subject: `A week left at ${yard}`,
      heading: "This placement ends in a week",
      body: [
        `${yard} runs ${term}. The sign comes down at the end of that, and the ground goes back as it was found.`,
        `To keep it up longer, the advertiser can book a fresh term — the yard is free from the day after this one ends.`,
      ],
      label: "See the placement",
    },
    "removal-due": {
      subject: `Time to take the sign down at ${yard}`,
      heading: "This placement has ended",
      body: [
        `${yard} has reached the end of its term and the sign is still recorded as standing.`,
        `A sign left up past its term is exactly what a city notices, and in some places every day is a separate offence. Take it down and confirm it on the placement page.`,
      ],
      label: "Confirm removal",
    },
  }[kind];

  const results = await Promise.all(
    [owner, advertiser].map((to) =>
      sendEmail({
        to,
        subject: message.subject,
        heading: message.heading,
        body: message.body,
        action: { label: message.label, url },
      }),
    ),
  );
  return results.find((r) => !r.sent) ?? { sent: true };
}
