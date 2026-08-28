"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/site-url";
import { notifyPlacementEvent } from "@/lib/notifications";
import type { PlacementEventKind } from "@/lib/supabase/types";

export type LifecycleState = { status: "idle" | "done" | "error"; message?: string };

const DENIED: LifecycleState = { status: "error", message: "You're not a party to this placement." };

/**
 * Who may act on a placement, and which side they are.
 *
 * An operator counts as a party to everything — they are the ones a city calls,
 * and a takedown they cannot perform is not a guarantee.
 */
async function partyFor(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const [{ data: request }, { data: profile }] = await Promise.all([
    admin.from("requests").select("*").eq("id", requestId).maybeSingle(),
    admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
  ]);
  if (!request) return null;

  const { data: listing } = await admin
    .from("listings")
    .select("owner_id")
    .eq("id", request.listing_id)
    .maybeSingle();

  const isOwner = listing?.owner_id === user.id;
  const isAdvertiser = request.requester_id === user.id;
  const isOperator = Boolean(profile?.is_admin);

  if (!isOwner && !isAdvertiser && !isOperator) return null;
  return { admin, user, request, isOwner, isAdvertiser, isOperator };
}

async function record(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  requestId: string,
  kind: PlacementEventKind,
  actorId: string,
  fields: { note?: string | null; photoPath?: string | null },
) {
  return admin.from("placement_events").insert({
    request_id: requestId,
    kind,
    actor_id: actorId,
    note: fields.note ?? null,
    photo_path: fields.photoPath ?? null,
  });
}

/**
 * The sign is in the ground.
 *
 * A photograph is asked for but not demanded. It is the advertiser's proof of
 * delivery and the operator's evidence when a city calls — but a homeowner
 * standing in their own yard with a bad signal should still be able to say the
 * sign is up.
 */
export async function confirmInstalled(
  _prev: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const requestId = String(formData.get("requestId") ?? "");
  const photoPath = String(formData.get("photoPath") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;

  const party = await partyFor(requestId);
  if (!party) return DENIED;
  const { admin, user, request } = party;

  if (request.status !== "active") {
    return { status: "error", message: "This placement isn't live yet." };
  }
  if (request.installed_at) {
    return { status: "error", message: "This one is already marked installed." };
  }

  await record(admin, requestId, "installed", user.id, { note, photoPath });
  await admin
    .from("requests")
    .update({ installed_at: new Date().toISOString() })
    .eq("id", requestId);

  await notifyPlacementEvent(requestId, "installed", null, await getSiteOrigin());

  revalidatePath(`/placements/${requestId}`);
  return { status: "done" };
}

/**
 * Start the 48-hour clock.
 *
 * The homeowner needs no reason — the agreement says so, and asking for one
 * would quietly turn a guarantee into a negotiation. Everyone else gives one,
 * because an advertiser or an operator pulling a sign down is information the
 * other side needs.
 */
export async function requestTakedown(
  _prev: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 400) || null;

  const party = await partyFor(requestId);
  if (!party) return DENIED;
  const { admin, user, request, isOwner } = party;

  if (request.takedown_requested_at) {
    return { status: "error", message: "A takedown is already under way." };
  }
  if (request.removed_at) {
    return { status: "error", message: "This sign has already come down." };
  }
  if (!isOwner && !reason) {
    return { status: "error", message: "Say why — the other party needs to know." };
  }

  const now = new Date().toISOString();
  await record(admin, requestId, "takedown_requested", user.id, { note: reason });
  await admin
    .from("requests")
    .update({ takedown_requested_at: now, takedown_reason: reason })
    .eq("id", requestId);

  await notifyPlacementEvent(requestId, "takedown_requested", reason, await getSiteOrigin());

  revalidatePath(`/placements/${requestId}`);
  revalidatePath("/admin");
  return { status: "done" };
}

/** The sign is out of the ground and the placement is finished. */
export async function confirmRemoved(
  _prev: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const requestId = String(formData.get("requestId") ?? "");
  const photoPath = String(formData.get("photoPath") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;

  const party = await partyFor(requestId);
  if (!party) return DENIED;
  const { admin, user, request } = party;

  if (request.removed_at) return { status: "error", message: "Already recorded as removed." };

  const now = new Date().toISOString();
  await record(admin, requestId, "removed", user.id, { note, photoPath });
  await admin
    .from("requests")
    .update({ removed_at: now, status: "completed" })
    .eq("id", requestId);

  await notifyPlacementEvent(requestId, "removed", null, await getSiteOrigin());

  revalidatePath(`/placements/${requestId}`);
  revalidatePath("/admin");
  return { status: "done" };
}

/**
 * Send the advertiser to Stripe to pay one charge.
 *
 * This returns a redirect rather than a result: Checkout is a hosted page on
 * Stripe's domain, and the whole point of using it is that card details never
 * touch Yardtize. The authorisation check lives in startCheckout, against the
 * ledger — a form field naming a charge id is not evidence of anything.
 */
export async function payCharge(_prev: LifecycleState, formData: FormData): Promise<LifecycleState> {
  const chargeId = String(formData.get("chargeId") ?? "");
  if (!chargeId) return DENIED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DENIED;

  const { startCheckout } = await import("@/lib/payments");
  const result = await startCheckout(chargeId, user.id, await getSiteOrigin());

  if (result.ok) redirect(result.url);

  switch (result.reason) {
    case "not-configured":
      return { status: "error", message: "Payments aren't switched on yet." };
    case "already-paid":
      return { status: "error", message: "That's already paid." };
    case "not-yours":
      return DENIED;
    default:
      return {
        status: "error",
        message: "Stripe didn't answer. Nothing was charged — try again in a moment.",
      };
  }
}

/**
 * Hold, or release, a deposit refund.
 *
 * Operator only. The deposit goes back automatically once the sign has been
 * down for the settling period, so this is the deliberate act of stopping
 * that — and it takes a reason rather than a flag, because the reason is
 * shown to both parties. "Held" with no explanation is how a marketplace
 * loses a homeowner and an advertiser in the same afternoon.
 */
export async function setDepositHold(
  _prev: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const requestId = String(formData.get("requestId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const party = await partyFor(requestId);
  if (!party?.isOperator) return DENIED;
  const { admin, user } = party;

  const { error } = await admin
    .from("requests")
    .update({ deposit_hold_reason: reason || null })
    .eq("id", requestId);
  if (error) return { status: "error", message: "That didn't save. Try again." };

  await record(admin, requestId, "note", user.id, {
    note: reason ? `Deposit refund held: ${reason}` : "Deposit hold released",
    photoPath: null,
  });

  revalidatePath(`/placements/${requestId}`);
  revalidatePath("/admin/settlement");
  return { status: "done" };
}
