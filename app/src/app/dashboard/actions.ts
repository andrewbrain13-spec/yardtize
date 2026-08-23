"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NameState = { status: "idle" | "saved" | "error"; message?: string };

/**
 * The name that appears on a placement summary. Nothing collected one before,
 * so every printed agreement identified both parties by email address.
 *
 * `full_name` is one of only two columns an account may update on its own row
 * — see migration 0008.
 */
export async function saveName(_prev: NameState, formData: FormData): Promise<NameState> {
  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, 120);
  if (!fullName) return { status: "error", message: "Enter the name you sign with." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Please sign in." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/dashboard");
  return { status: "saved" };
}
