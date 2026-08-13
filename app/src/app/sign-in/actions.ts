"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";

export type SignInState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

export async function sendMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "");

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      status: "error",
      message:
        "Sign-in isn't connected yet. The Supabase keys still need to be added to this deployment.",
    };
  }

  const origin = await getSiteOrigin();
  const callback = new URL("/auth/callback", origin);
  if (next) callback.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    return { status: "error", message: error.message, email };
  }

  return { status: "sent", email };
}
