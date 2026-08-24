import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { planBilling, dollarsToCents } from "@/lib/billing";
import { LEASE_VERSION, type LeaseTerms } from "@/lib/lease";
import { PLATFORM_INSTALL_EACH_WAY } from "@/lib/booking";
import type { Jurisdiction, Listing, PlacementRequest } from "@/lib/supabase/types";

/**
 * Builds the frozen terms for a placement and creates its lease.
 *
 * Runs on the service role because it reads both parties' names — neither may
 * read the other's profile, and both belong on the document.
 *
 * Idempotent: a lease already exists for most calls, because the homeowner
 * approving is what triggers this and an approval can be re-fired. Returns the
 * existing one rather than replacing it — regenerating would silently change
 * terms somebody may already have signed.
 */
export async function ensureLease(requestId: string): Promise<{ created: boolean } | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: existing } = await admin
    .from("leases")
    .select("id")
    .eq("request_id", requestId)
    .maybeSingle();
  if (existing) return { created: false };

  const terms = await buildLeaseTerms(requestId);
  if (!terms) return null;

  const { error } = await admin.from("leases").insert({
    request_id: requestId,
    status: "awaiting_signature",
    terms,
  });

  // A unique index on request_id makes a race here land as 23505, which means
  // somebody else just created it — the desired end state either way.
  if (error && error.code !== "23505") return null;
  return { created: !error };
}

export async function buildLeaseTerms(requestId: string): Promise<LeaseTerms | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: requestRow } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!requestRow) return null;
  const request = requestRow as PlacementRequest;

  const { data: listingRow } = await admin
    .from("listings")
    .select("*")
    .eq("id", request.listing_id)
    .maybeSingle();
  if (!listingRow) return null;
  const listing = listingRow as Listing;

  const [{ data: owner }, { data: advertiser }] = await Promise.all([
    admin.from("profiles").select("email, full_name").eq("id", listing.owner_id).maybeSingle(),
    admin.from("profiles").select("email, full_name").eq("id", request.requester_id).maybeSingle(),
  ]);

  let jurisdiction: Jurisdiction | null = null;
  if (listing.jurisdiction_id) {
    const { data } = await admin
      .from("jurisdictions")
      .select("*")
      .eq("id", listing.jurisdiction_id)
      .maybeSingle();
    jurisdiction = data as Jurisdiction | null;
  }

  const plan = planBilling({
    monthlyRateDollars: listing.monthly_rate ?? 0,
    startsOn: request.starts_on,
    endsOn: request.ends_on,
    install: request.install,
  });
  const placements = plan.charges.filter((c) => c.kind === "placement");

  return {
    version: LEASE_VERSION,
    generatedAt: new Date().toISOString(),
    reference: request.id.slice(0, 8).toUpperCase(),
    owner: {
      name: owner?.full_name ?? "",
      email: owner?.email ?? "",
    },
    advertiser: {
      name: request.advertiser_name,
      contact: advertiser?.full_name ?? "",
      email: advertiser?.email ?? "",
      type: request.advertiser_type,
    },
    premises: {
      address: listing.street_address,
      city: listing.city,
      state: listing.state,
      postalCode: listing.postal_code ?? "",
      signLat: listing.sign_lat,
      signLng: listing.sign_lng,
      aadt: listing.aadt_sum,
      trafficSource: listing.traffic_source,
      trafficYear: listing.traffic_year,
    },
    sign: {
      sizeLabel: request.sign_size_label,
      sqft: Number(request.sign_size_sqft),
      install: request.install,
    },
    term: {
      startsOn: request.starts_on,
      endsOn: request.ends_on,
      isElectionWindow: request.is_election_window,
    },
    money: {
      monthlyRateCents: dollarsToCents(listing.monthly_rate ?? 0),
      dueNowCents: plan.dueNowCents,
      monthlyChargeCents: placements[1]?.amountCents ?? 0,
      ownerTotalCents: plan.ownerTotalCents,
      feeTotalCents: plan.feeTotalCents,
      advertiserTotalCents: plan.totalCents,
      depositCents: plan.refundableCents,
      installCents: dollarsToCents(PLATFORM_INSTALL_EACH_WAY * 2),
      // Grouped by due date: the first month and the deposit are one payment.
      schedule: Object.entries(
        plan.charges.reduce<Record<string, number>>((acc, c) => {
          acc[c.dueOn] = (acc[c.dueOn] ?? 0) + c.amountCents;
          return acc;
        }, {}),
      )
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([dueOn, amountCents], i) => ({
          dueOn,
          amountCents,
          label: i === 0 ? "On approval" : "Instalment",
        })),
    },
    jurisdiction: jurisdiction
      ? {
          name: jurisdiction.name,
          state: jurisdiction.state,
          verified: jurisdiction.is_verified,
          maxSqft: jurisdiction.rules.max_sign_sqft,
          maxHeightFt: jurisdiction.rules.max_height_ft,
          setbackFt: jurisdiction.rules.setback_ft,
          displayPeriodDays: jurisdiction.rules.display_period_days,
          gapDays: jurisdiction.rules.gap_days,
          citations: jurisdiction.citations ?? [],
        }
      : null,
  };
}
