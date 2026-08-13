import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HashCallback } from "./HashCallback";

/**
 * Where magic links land.
 *
 * Two shapes arrive here:
 *  - `?code=…`  — the PKCE flow used by links emailed from the sign-in form.
 *                  Exchanged for a session on the server.
 *  - `#access_token=…` — the implicit flow used by admin-issued links. The
 *                  fragment never reaches the server, so HashCallback picks
 *                  it up in the browser.
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string; error_description?: string }>;
}) {
  const { code, next, error_description } = await searchParams;

  if (error_description) {
    redirect(`/sign-in?error=${encodeURIComponent(error_description)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      redirect("/sign-in?error=That+sign-in+link+has+expired.+Here%27s+a+fresh+one.");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile?.role) {
        redirect(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
      }
    }

    redirect(next || "/dashboard");
  }

  return <HashCallback next={next} />;
}
