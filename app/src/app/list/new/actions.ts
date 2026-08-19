"use server";

import { redirect } from "next/navigation";
import type { GeocodedAddress } from "@/lib/geocode";
import { findJurisdiction, evaluateCompliance, type ComplianceReport } from "@/lib/compliance";
import { createClient } from "@/lib/supabase/server";

export type LookupState =
  | { status: "idle" }
  | { status: "error"; message: string; query?: string }
  | {
      status: "found";
      address: GeocodedAddress;
      compliance: Pick<ComplianceReport, "checks" | "verified" | "maxOfferedSqft" | "citations"> & {
        jurisdictionId: string;
        jurisdictionName: string;
      };
    };

/**
 * Step 1: attach a city's sign rules to an address the browser has already
 * resolved.
 *
 * Geocoding happens in the browser rather than here because the Maps key is
 * restricted by website referrer, and Google rejects those keys on
 * server-to-server calls. Coordinates arriving from the client are only ever
 * used to pick a rules row and centre a map, never to assert a traffic count —
 * those are fetched server-side from the state DOT.
 */
export async function attachJurisdiction(
  address: GeocodedAddress,
): Promise<LookupState> {
  if (!address?.city || !address.state) {
    return { status: "error", message: "That address is missing a city, so we can't check sign rules." };
  }

  const jurisdiction = await findJurisdiction(address.city, address.state);
  if (!jurisdiction) {
    return {
      status: "error",
      message: "We couldn't load sign rules for that city. Please try again in a moment.",
    };
  }

  const report = evaluateCompliance(jurisdiction, { cornerLot: false });

  return {
    status: "found",
    address,
    compliance: {
      checks: report.checks,
      verified: report.verified,
      maxOfferedSqft: report.maxOfferedSqft,
      citations: report.citations,
      jurisdictionId: jurisdiction.id,
      jurisdictionName: `${jurisdiction.name}, ${jurisdiction.state}`,
    },
  };
}

export type PublishInput = {
  address: GeocodedAddress;
  jurisdictionId: string;
  signLat: number;
  signLng: number;
  aadtSum: number | null;
  segments: Array<{ road: string; aadt: number; year: number; source: string }>;
  source: string | null;
  year: number | null;
  signalized: boolean;
  cornerLot: boolean;
  suggestedRate: number | null;
  monthlyRate: number;
};

/** Step 3: write the listing and send the owner to it. */
export async function publishListing(input: PublishInput): Promise<{ error: string } | never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in?next=/list/new");

  const { address } = input;
  const headline = input.signalized
    ? `Signalized corner · ${address.city}`
    : input.cornerLot
      ? `Corner lot · ${address.city}`
      : `${address.city} frontage`;

  const { data, error } = await supabase
    .from("listings")
    .insert({
      owner_id: user.id,
      jurisdiction_id: input.jurisdictionId,
      street_address: address.streetAddress,
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      headline,
      lat: address.lat,
      lng: address.lng,
      sign_lat: input.signLat,
      sign_lng: input.signLng,
      aadt_sum: input.aadtSum,
      traffic_segments: input.segments,
      traffic_source: input.source,
      traffic_year: input.year,
      signalized: input.signalized,
      corner_lot: input.cornerLot,
      suggested_rate: input.suggestedRate,
      monthly_rate: input.monthlyRate,
      status: "live",
      is_demo: false,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/list/${data.id}?published=1`);
}
