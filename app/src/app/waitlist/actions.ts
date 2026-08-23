"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

export type WaitlistState = { status: "idle" | "joined" | "error"; message?: string };

const ROLES: UserRole[] = ["homeowner", "business"];

/*
 * Deliberately the ordinary anon client, not the service-role one: the table's
 * policy allows an insert from anybody and a read from nobody, which is exactly
 * the access a public sign-up form should have. Reaching for the secret key
 * here would work and would be worse.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const city = String(formData.get("city") ?? "").trim() || null;
  const state = String(formData.get("state") ?? "").trim().toUpperCase() || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const source = String(formData.get("source") ?? "unknown").slice(0, 60);
  const roleRaw = String(formData.get("role") ?? "");
  const role = ROLES.includes(roleRaw as UserRole) ? (roleRaw as UserRole) : null;

  // Enough of a check to catch a typo; the confirmation is the real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { status: "error", message: "That email address doesn't look right." };
  }
  if (state && !/^[A-Z]{2}$/.test(state)) {
    return { status: "error", message: "Use a two-letter state, like MO or KS." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist")
    .insert({ email, city, state, note, source, role });

  if (error) {
    // 23505 is the unique index catching someone who already signed up for the
    // same place. Telling them they failed would be a lie and a little rude.
    if (error.code === "23505") return { status: "joined" };
    return { status: "error", message: "Something went wrong. Try again in a moment." };
  }

  return { status: "joined" };
}
