import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, Badge, Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your account — Yardtize" };

export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session?.user) redirect("/sign-in?next=/dashboard");
  if (!session.profile?.role) redirect("/welcome");

  const isHomeowner = session.profile.role === "homeowner";

  return (
    <div className="max-w-[720px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px]">
        <div className="flex items-center gap-2.5 flex-wrap mb-4">
          <h1 className="text-[26px] tracking-[-0.4px]">Your account</h1>
          <Badge>{isHomeowner ? "Homeowner" : "Business"}</Badge>
        </div>
        <p className="text-ink-2 mb-1">
          Signed in as <b className="text-ink">{session.user.email}</b>.
        </p>
        <p className="text-ink-2 mb-7">
          {isHomeowner
            ? "List a yard, then approve or decline the businesses and campaigns that ask for it."
            : "Browse yards ranked by the traffic that passes them, and request the corners that fit your campaign."}
        </p>

        <div className="flex gap-3 flex-wrap">
          <ButtonLink href={isHomeowner ? "/list" : "/browse"}>
            {isHomeowner ? "List your yard" : "Browse yards"}
          </ButtonLink>
          {isHomeowner && (
            <ButtonLink href="/inbox" variant="ghost">
              Placement requests
            </ButtonLink>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="px-[17px] py-2.5 rounded-[11px] text-[15px] font-semibold border border-edge text-ink hover:brightness-[1.06]">
              Sign out
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
