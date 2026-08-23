import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";
import type { Database } from "./types";

/**
 * Supabase client holding the secret key, which bypasses row-level security
 * entirely. Every other client in this app is deliberately constrained by RLS;
 * this one is not, so it is reserved for the two jobs that genuinely cannot be
 * done as the signed-in user:
 *
 *   1. Notifications — telling a homeowner a request arrived means reading the
 *      advertiser's email address, and vice versa. Neither party may read the
 *      other's profile row, and neither should be able to.
 *   2. The pilot admin view — one operator seeing activity across all accounts.
 *
 * `server-only` makes importing this from a client component a build error.
 * The key has no NEXT_PUBLIC_ prefix, so it would be undefined in the browser
 * regardless, but a broken page is a worse way to learn that than a failed
 * build.
 *
 * Returns null rather than throwing when the key is absent: a deployment
 * without it should still serve the site, just without notifications.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;

  return createSupabaseClient<Database>(SUPABASE_URL(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
