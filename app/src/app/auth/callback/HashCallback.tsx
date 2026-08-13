"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EXPIRED = "/sign-in?error=That+sign-in+link+has+expired.";

/**
 * Fallback for Supabase's implicit flow, which returns the session in the URL
 * fragment (`#access_token=…`). Fragments are never sent to the server, so the
 * server component cannot see them — this reads the hash in the browser and
 * hands the tokens to the Supabase client, which writes the auth cookies.
 *
 * The normal emailed magic link uses PKCE and arrives as `?code=`, handled
 * server-side. This covers admin-issued links and any implicit-flow fallback.
 */
export function HashCallback({ next }: { next?: string }) {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      router.replace(EXPIRED);
      return;
    }

    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          router.replace(EXPIRED);
          return;
        }
        // Clear the tokens out of the address bar, then let /welcome decide:
        // it forwards straight on if this user already picked a role.
        window.history.replaceState(null, "", window.location.pathname);
        router.replace(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
      })
      .catch(() => router.replace(EXPIRED));
  }, [next, router]);

  return (
    <p className="text-ink-2 text-center py-[90px]" role="status">
      Signing you in…
    </p>
  );
}
