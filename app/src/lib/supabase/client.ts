import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";
import type { Database } from "./types";

/** Supabase client for browser (client component) use. */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_PUBLISHABLE_KEY());
}
