import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "List your yard — Yardtize" };

export default async function NewListingPage() {
  const session = await getSessionProfile();
  if (!session?.user) redirect("/sign-in?next=/list/new");
  if (!session.profile?.role) redirect("/welcome?next=/list/new");

  // Public map key. Absent until it has been restricted to our domains and
  // added to the deployment — the wizard degrades to a labelled placeholder.
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  return <Wizard mapsApiKey={mapsApiKey} />;
}
