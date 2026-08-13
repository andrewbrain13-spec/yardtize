"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

const ROLES: UserRole[] = ["homeowner", "business"];

export type RoleState = { error?: string };

export async function chooseRole(
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  const role = String(formData.get("role") ?? "") as UserRole;
  const next = String(formData.get("next") ?? "");

  if (!ROLES.includes(role)) {
    return { error: "Please choose how you'll be using Yardtize." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", user.id);

  if (error) return { error: error.message };

  redirect(next || (role === "homeowner" ? "/list" : "/browse"));
}
