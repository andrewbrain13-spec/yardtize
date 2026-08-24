"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ListingStatus } from "@/lib/supabase/types";

export type ModState = { status: "idle" | "done" | "error"; message?: string };

/*
 * Operator actions. Every one of them re-checks is_admin here rather than
 * trusting that the screen they were fired from was gated: a server action is
 * a public endpoint, reachable by anyone who knows its name.
 *
 * Writes go through the service-role client because these cross accounts by
 * definition — an operator is acting on somebody else's listing.
 */
async function operator() {
  const session = await getSessionProfile();
  if (!session?.profile?.is_admin) return null;
  return createAdminClient();
}

const DENIED: ModState = { status: "error", message: "Not permitted." };

/** Pull a yard out of the marketplace, or put it back. */
export async function setListingStatus(
  _prev: ModState,
  formData: FormData,
): Promise<ModState> {
  const admin = await operator();
  if (!admin) return DENIED;

  const id = String(formData.get("listingId") ?? "");
  const status = String(formData.get("status") ?? "") as ListingStatus;
  if (!["live", "paused", "draft"].includes(status)) {
    return { status: "error", message: "Unknown status." };
  }

  const { error } = await admin.from("listings").update({ status }).eq("id", id);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin");
  revalidatePath("/browse");
  return { status: "done" };
}

/**
 * Remove a yard for good.
 *
 * Requests against it go too, by the cascade the schema already declares. For
 * a complaint the reversible pause is nearly always the right tool; this is for
 * seed data and for a listing that should never have existed.
 */
export async function deleteListing(_prev: ModState, formData: FormData): Promise<ModState> {
  const admin = await operator();
  if (!admin) return DENIED;

  const id = String(formData.get("listingId") ?? "");
  const { error } = await admin.from("listings").delete().eq("id", id);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin");
  revalidatePath("/browse");
  return { status: "done" };
}

/**
 * Stop an account, or let it back in.
 *
 * Suspension hides every yard the account owns and blocks new listings and
 * requests. It does not delete anything: a complaint that turns out to be
 * wrong should cost nobody their listings.
 */
export async function setSuspended(_prev: ModState, formData: FormData): Promise<ModState> {
  const admin = await operator();
  if (!admin) return DENIED;

  const id = String(formData.get("profileId") ?? "");
  const suspend = formData.get("suspend") === "true";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  if (suspend && !reason) {
    return { status: "error", message: "Say why — you'll want the record later." };
  }

  // An operator suspending themselves would lock the pilot out of its own
  // controls, and there is no second operator to undo it.
  const session = await getSessionProfile();
  if (suspend && session?.user?.id === id) {
    return { status: "error", message: "You can't suspend your own account." };
  }

  const { error } = await admin
    .from("profiles")
    .update(
      suspend
        ? { suspended_at: new Date().toISOString(), suspended_reason: reason }
        : { suspended_at: null, suspended_reason: null },
    )
    .eq("id", id);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/admin/people");
  revalidatePath("/admin");
  revalidatePath("/browse");
  return { status: "done" };
}
