import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/supabase/server";
import { RolePicker } from "./RolePicker";

export const metadata: Metadata = { title: "Welcome — Yardtize" };

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await getSessionProfile();

  if (!session?.user) redirect("/sign-in?next=/welcome");
  if (session.profile?.role) redirect(next ?? "/dashboard");

  return (
    <div className="max-w-[560px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px]">
        <h1 className="text-[26px] tracking-[-0.4px]">Welcome to Yardtize</h1>
        <p className="text-ink-2 mt-2 mb-6">
          Signed in as <b className="text-ink">{session.user.email}</b>. Which
          side of the marketplace are you on?
        </p>
        <RolePicker next={next} />
      </Card>
    </div>
  );
}
