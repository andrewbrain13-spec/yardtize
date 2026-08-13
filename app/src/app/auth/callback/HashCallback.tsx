"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (!access_token || !refresh_token) {
      setFailed(true);
      return;
    }

    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setFailed(true);
          return;
        }
        // Clear the tokens out of the address bar, then let /welcome decide:
        // it forwards straight on if this user already picked a role.
        window.history.replaceState(null, "", window.location.pathname);
        const target = new URL("/welcome", window.location.origin);
        if (next) target.searchParams.set("next", next);
        router.replace(target.pathname + target.search);
      })
      .catch(() => setFailed(true));
  }, [next, router]);

  useEffect(() => {
    if (failed) router.replace("/sign-in?error=That+sign-in+link+has+expired.");
  }, [failed, router]);

  return (
    <p className="text-ink-2 text-center py-[90px]" role="status">
      Signing you in…
    </p>
  );
}
