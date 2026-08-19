"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { evaluateAdvertiserFit } from "@/lib/compliance";
import type { AdvertiserType, InstallChoice, Jurisdiction } from "@/lib/supabase/types";

export type RequestState = { status: "idle" | "sent" | "error"; message?: string };

/**
 * Submits a placement request.
 *
 * The compliance check is repeated here on the server. The browser hides
 * ineligible options, but a request that a city's sign code forbids must never
 * reach a homeowner's inbox just because someone bypassed the form.
 */
export async function submitRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "error", message: "Please sign in to request a placement." };

  const listingId = String(formData.get("listingId") ?? "");
  const advertiserType = String(formData.get("advertiserType") ?? "") as AdvertiserType;
  const advertiserName = String(formData.get("advertiserName") ?? "").trim();
  const sizeLabel = String(formData.get("signSizeLabel") ?? "");
  const sizeSqft = Number(formData.get("signSizeSqft") ?? 0);
  const duration = String(formData.get("duration") ?? "");
  const install = String(formData.get("install") ?? "self") as InstallChoice;
  const message = String(formData.get("message") ?? "").trim() || null;
  const renderingPath = String(formData.get("renderingPath") ?? "").trim() || null;

  if (!advertiserName) {
    return { status: "error", message: "Tell the homeowner who is advertising." };
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id, jurisdiction_id, corner_lot, status")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing || listing.status !== "live") {
    return { status: "error", message: "That listing is no longer available." };
  }

  let jurisdiction: Jurisdiction | null = null;
  if (listing.jurisdiction_id) {
    const { data } = await supabase
      .from("jurisdictions")
      .select("*")
      .eq("id", listing.jurisdiction_id)
      .maybeSingle();
    jurisdiction = data;
  }

  if (jurisdiction) {
    const fit = evaluateAdvertiserFit(jurisdiction, advertiserType, listing.corner_lot);
    if (!fit.allowed) return { status: "error", message: fit.reason };

    const rules = jurisdiction.rules;
    if (sizeSqft > rules.max_sign_sqft) {
      return {
        status: "error",
        message: `${sizeSqft} sq ft is over ${jurisdiction.name}'s ${rules.max_sign_sqft} sq ft limit.`,
      };
    }
  }

  const isElection = duration === "election";
  const { error } = await supabase.from("requests").insert({
    listing_id: listingId,
    requester_id: user.id,
    advertiser_type: advertiserType,
    advertiser_name: advertiserName,
    sign_size_label: sizeLabel,
    sign_size_sqft: sizeSqft,
    duration_months: isElection ? null : Number(duration),
    is_election_window: isElection,
    install,
    rendering_path: renderingPath,
    message,
    status: "requested",
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/browse");
  return { status: "sent" };
}
