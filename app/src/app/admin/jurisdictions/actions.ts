"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JurisdictionRules } from "@/lib/supabase/types";

export type SaveState = { status: "idle" | "error"; message?: string };

const num = (fd: FormData, key: string): number | null => {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const str = (fd: FormData, key: string): string | null =>
  String(fd.get(key) ?? "").trim() || null;
const bool = (fd: FormData, key: string) => fd.get(key) === "on";

/**
 * Adds or updates a city in the compliance engine.
 *
 * The schema was always meant to make a new city a data entry rather than a
 * code change, but until now the only way to do the entry was to write a SQL
 * migration. This is that entry form.
 *
 * Writes go through the service-role client on purpose: `jurisdictions` has a
 * public read policy and no write policy at all, so the rules a homeowner is
 * shown cannot be edited by anyone holding a browser session.
 */
export async function saveJurisdiction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await getSessionProfile();
  if (!session?.profile?.is_admin) return { status: "error", message: "Not permitted." };

  const admin = createAdminClient();
  if (!admin) {
    return { status: "error", message: "SUPABASE_SECRET_KEY isn't set on this deployment." };
  }

  const id = str(formData, "id");
  const name = str(formData, "name");
  const state = (str(formData, "state") ?? "").toUpperCase();

  if (!name) return { status: "error", message: "The city needs a name." };
  if (!/^[A-Z]{2}$/.test(state)) {
    return { status: "error", message: "Use a two-letter state, like MO or KS." };
  }

  const maxSqft = num(formData, "max_sign_sqft");
  const maxHeight = num(formData, "max_height_ft");
  if (maxSqft === null || maxSqft <= 0) {
    return { status: "error", message: "A sign-area limit is required — it drives every size offered." };
  }
  if (maxHeight === null || maxHeight <= 0) {
    return { status: "error", message: "A height limit is required." };
  }

  const verified = bool(formData, "is_verified");
  const citations = String(formData.get("citations") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  /*
   * Claiming a city is verified without saying where the text came from is how
   * an invented rule ends up in front of a homeowner. The engine also prints
   * these under the compliance card, so an empty list would read as if the
   * rules came from nowhere.
   */
  if (verified && citations.length === 0) {
    return {
      status: "error",
      message: "A verified city needs at least one citation — the section numbers you read.",
    };
  }

  const weekendAllowed = bool(formData, "weekend_corner_allowed");

  const rules: JurisdictionRules = {
    max_sign_sqft: maxSqft,
    max_height_ft: maxHeight,
    setback_ft: num(formData, "setback_ft"),
    corner_diagonal_ft: num(formData, "corner_diagonal_ft"),
    permit_required_above_sqft: num(formData, "permit_required_above_sqft"),
    // A Yardtize rule everywhere, stricter than any city allows.
    max_signs_per_lot: 1,
    noncommercial: {
      aggregate_sqft: num(formData, "noncommercial_aggregate_sqft") ?? maxSqft,
      duration_limit_days: num(formData, "noncommercial_duration_limit_days"),
      note: str(formData, "noncommercial_note") ?? undefined,
    },
    commercial_offpremise_allowed: bool(formData, "commercial_offpremise_allowed"),
    commercial_note: str(formData, "commercial_note") ?? undefined,
    nonprofit_exempt: bool(formData, "nonprofit_exempt"),
    nonprofit_note: str(formData, "nonprofit_note") ?? undefined,
    political: {
      allowed_year_round: bool(formData, "political_allowed_year_round"),
      statute: str(formData, "political_statute") ?? undefined,
      protected_window_start: str(formData, "political_window_start") ?? undefined,
      protected_window_end: str(formData, "political_window_end") ?? undefined,
      note: str(formData, "political_note") ?? undefined,
    },
    display_period_days: num(formData, "display_period_days"),
    gap_days: num(formData, "gap_days"),
    weekend_corner: weekendAllowed
      ? {
          allowed: true,
          max_sqft_per_face: num(formData, "weekend_corner_max_sqft_per_face") ?? 3,
          max_faces: num(formData, "weekend_corner_max_faces") ?? 2,
          max_height_ft: num(formData, "weekend_corner_max_height_ft") ?? 4,
          window: str(formData, "weekend_corner_window") ?? "",
          note: str(formData, "weekend_corner_note") ?? undefined,
        }
      : null,
    enforcement: {
      process: str(formData, "enforcement_process") ?? "Not yet researched.",
      platform_posture:
        str(formData, "enforcement_posture") ??
        "48-hour takedown on any notice.",
    },
  };

  const row = {
    name,
    state,
    // The geocoder hands back a city name; this is what it is matched against.
    match_city: (str(formData, "match_city") ?? name).toLowerCase(),
    is_verified: verified,
    rules,
    citations,
  };

  const { error } = id
    ? await admin.from("jurisdictions").update(row).eq("id", id)
    : await admin.from("jurisdictions").insert(row);

  if (error) {
    // The unique index on (match_city, state) is the one people will hit.
    if (error.code === "23505") {
      return { status: "error", message: `${name}, ${state} is already in the list.` };
    }
    return { status: "error", message: error.message };
  }

  revalidatePath("/admin/jurisdictions");
  revalidatePath("/coverage");
  redirect("/admin/jurisdictions?saved=1");
}
