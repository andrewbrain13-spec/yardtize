"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { startPayoutOnboarding } from "@/lib/payments";

/**
 * Take a homeowner to Stripe to say where their money should land.
 *
 * Nothing about the bank details comes back through here — Stripe collects
 * them on its own pages and tells us only whether it will pay the account.
 *
 * Every path out of this is a redirect, including the failures, because the
 * success path leaves for another domain and there is no state left to render
 * against afterwards. What went wrong is carried in the URL and read back on
 * the page.
 */
export async function connectPayouts(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/sign-in?next=/earnings");

  const result = await startPayoutOnboarding(user.id, user.email, await getSiteOrigin());
  redirect(result.ok ? result.url : `/earnings?connect=${result.reason}`);
}
