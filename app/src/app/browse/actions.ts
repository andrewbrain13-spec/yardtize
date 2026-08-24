"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { notifyOwnerOfRequest } from "@/lib/notifications";
import { evaluateAdvertiserFit } from "@/lib/compliance";
import { checkAvailability, termFor, today } from "@/lib/scheduling";
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

  // The view only contains live listings, so a miss here covers both "no such
  // listing" and "not live" — and an advertiser cannot read the base table.
  const { data: listing } = await supabase
    .from("listings_public")
    .select("id, jurisdiction_id, corner_lot, is_demo")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing) {
    return { status: "error", message: "That listing is no longer available." };
  }

  /*
   * Seeded yards exist to show investors what the product looks like with
   * inventory in it. There is no homeowner behind them to answer, so a request
   * against one would sit unanswered forever.
   */
  if (listing.is_demo) {
    return {
      status: "error",
      message:
        "That's a demonstration listing, not a real yard. Look for one without the demo label.",
    };
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

  /*
   * The term. An advertiser picks a start date; the election window overrides
   * it with its own fixed dates, since that product IS those seven weeks.
   */
  const term = termFor({
    startsOn: String(formData.get("startsOn") ?? "").trim() || today(),
    durationMonths: isElection ? null : Number(duration),
    isElectionWindow: isElection,
  });

  /*
   * Checked here as well as in the browser, and the database refuses an
   * overlap regardless (migration 0010). This layer exists to give a reason
   * rather than a constraint violation — and to catch the case the database
   * cannot see, where the clash is with the city's rules rather than another
   * booking.
   */
  const { data: bookedRows } = await supabase
    .from("listing_availability")
    .select("starts_on, ends_on")
    .eq("listing_id", listingId);

  const availability = checkAvailability(
    term,
    (bookedRows ?? []).map((b) => ({ startsOn: b.starts_on, endsOn: b.ends_on })),
    jurisdiction?.rules,
  );

  if (!availability.ok) {
    return { status: "error", message: availability.reason };
  }

  const { data: created, error } = await supabase
    .from("requests")
    .insert({
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
      starts_on: term.startsOn,
      ends_on: term.endsOn,
    })
    .select("id")
    .single();

  if (error) return { status: "error", message: error.message };

  /*
   * The homeowner has no reason to be looking at the site when this lands, so
   * the email is the notification. A send failure is logged and swallowed —
   * the request is already stored, and the inbox shows it either way.
   */
  if (created) {
    const result = await notifyOwnerOfRequest(created.id, await getSiteOrigin());
    if (!result.sent && result.reason === "failed") {
      console.error("[notify] owner request email failed:", result.detail);
    }
  }

  revalidatePath("/browse");
  return { status: "sent" };
}
