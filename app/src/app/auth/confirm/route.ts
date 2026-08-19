import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing point using a token hash.
 *
 * The older `?code=` flow (PKCE) can only be completed by the same browser
 * that asked for the link, because the matching verifier lives in a cookie
 * there. People routinely request a link on a laptop and open it on a phone,
 * or their mail client opens it in its own in-app browser — in which case the
 * exchange fails and they land back on the sign-in page. Verifying a token
 * hash has no such requirement, so the link works wherever it is opened.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(message)}`, origin),
    );

  if (!token_hash || !type) {
    return fail("That sign-in link was incomplete. Here's a fresh one.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    return fail(
      "That sign-in link has already been used or has expired. Enter your email for a new one.",
    );
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
      return NextResponse.redirect(
        new URL(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome", origin),
      );
    }
  }

  return NextResponse.redirect(new URL(next || "/dashboard", origin));
}
