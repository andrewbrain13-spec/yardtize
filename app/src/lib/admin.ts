import "server-only";

import { notFound, redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The gate on every operator screen.
 *
 * Not-found rather than forbidden for a signed-in non-admin: there is no
 * reason for an ordinary account to learn these pages exist. Signed-out
 * visitors are sent to sign in, because the common case there is the operator
 * on a new device rather than someone poking around.
 *
 * Returns the service-role client because every operator screen needs it —
 * reading across accounts is the entire purpose.
 */
export async function requireAdmin(next: string) {
  const session = await getSessionProfile();
  if (!session?.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!session.profile?.is_admin) notFound();

  return { session, admin: createAdminClient() };
}
