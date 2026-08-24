"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type ConfirmState = { error?: string };

/**
 * Completes a magic-link sign-in.
 *
 * Deliberately a POST from a button rather than something that happens when
 * the link is opened. A sign-in token may be spent exactly once, and business
 * mail systems open every link in every message before the recipient ever sees
 * it — so a token spent on page load is routinely spent by a scanner, and the
 * real person arrives to be told their brand-new link was "already used".
 * Requiring a click means an automated fetch gets a harmless page and the
 * token survives for the human.
 */
export async function completeSignIn(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "magiclink") as EmailOtpType;
  const next = String(formData.get("next") ?? "");

  if (!tokenHash) {
    return { error: "That sign-in link was incomplete. Ask for a fresh one." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    return {
      error:
        "That link has expired or was already used. Sign-in links last an hour and work once — enter your email below for a new one.",
    };
  }

  redirect(await destination(next));
}

/** Signs in from an emailed code instead of a link. */
export async function signInWithCode(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // People paste these with spaces or dashes in them.
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  const next = String(formData.get("next") ?? "");

  if (!email) return { error: "Enter the email address you asked for the code with." };
  if (token.length < 6) return { error: "That code doesn't look complete." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return { error: "That code didn't work. It lasts an hour — ask for a new one below." };
  }

  redirect(await destination(next));
}

/** Somebody with no role yet needs the role picker before anything else. */
async function destination(next: string): Promise<string> {
  const supabase = await createClient();
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
      return next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome";
    }
  }

  return next || "/dashboard";
}
