"use server";

import { redirect } from "next/navigation";
import { geocodeAddress, type GeocodedAddress } from "@/lib/geocode";
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

/** Step 1: turn a typed address into coordinates and that city's sign rules. */
export async function lookupAddress(
  _prev: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const query = String(formData.get("address") ?? "").trim();
  if (query.length < 5) {
    return { status: "error", message: "Please enter a full street address.", query };
  }

  const result = await geocodeAddress(query);
  if (!result.ok) return { status: "error", message: result.reason, query };

  const address = result.address;
  const jurisdiction = await findJurisdiction(address.city, address.state);

  if (!jurisdiction) {
    return {
      status: "error",
      message: "We couldn't load sign rules for that city. Please try again in a moment.",
      query,
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
