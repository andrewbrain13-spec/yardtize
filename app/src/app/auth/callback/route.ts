import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing point. Supabase redirects here with a one-time code,
 * which we exchange for a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    const url = new URL("/sign-in", origin);
    url.searchParams.set("error", errorDescription);
    return NextResponse.redirect(url);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/sign-in", origin);
    url.searchParams.set("error", "That sign-in link has expired. Here's a fresh one.");
    return NextResponse.redirect(url);
  }

  // New users have no role yet and must choose one before going anywhere else.
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
      const welcome = new URL("/welcome", origin);
      if (next) welcome.searchParams.set("next", next);
      return NextResponse.redirect(welcome);
    }
  }

  return NextResponse.redirect(new URL(next || "/dashboard", origin));
}
