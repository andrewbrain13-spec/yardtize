import type { Metadata } from "next";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { money } from "@/lib/money";

export const metadata: Metadata = { title: "List your yard — Yardtize" };

const STEPS = [
  "Enter your address and see your property from above on a satellite map.",
  "Drag a pin to where a sign would stand — we look up the official MoDOT or KDOT traffic counts for the roads you front.",
  "See your city's actual sign rules checked against your placement, with a suggested monthly rate you can adjust.",
];

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function ListPage() {
  const session = await getSessionProfile().catch(() => null);

  let listings: Array<{
    id: string;
    headline: string | null;
    city: string;
    state: string;
    aadt_sum: number | null;
    monthly_rate: number | null;
    status: string;
    signalized: boolean;
  }> = [];

  if (session?.user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("listings")
      .select("id, headline, city, state, aadt_sum, monthly_rate, status, signalized")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });
    listings = data ?? [];
  }

  return (
    <div className="max-w-[720px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px]">
        <h1 className="text-[30px] tracking-[-0.6px]">List your yard</h1>
        <p className="text-ink-2 mt-3 text-[16px] max-w-[52ch]">
          Three steps, no paperwork, and you approve every advertiser before a
          sign ever goes in the ground.
        </p>
        <ul className="mt-6 flex flex-col gap-3">
          {STEPS.map((step) => (
            <li key={step} className="flex gap-[9px] items-start text-[14px]">
              <span className="shrink-0 grid place-items-center w-[18px] h-[18px] mt-[3px] rounded-full bg-brand-wash-2 text-good-text text-[11px] font-extrabold">
                ✓
              </span>
              <span className="text-ink-2">{step}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <ButtonLink href={session?.user ? "/list/new" : "/sign-in?next=/list/new"} size="big">
            {session?.user ? "Start a listing →" : "Sign in to start →"}
          </ButtonLink>
        </div>
      </Card>

      {listings.length > 0 && (
        <Card className="p-[26px] mt-5">
          <h2 className="text-[18px] tracking-[-0.3px] mb-3">Your listings</h2>
          {listings.map((l) => (
            <a
              key={l.id}
              href={`/list/${l.id}`}
              className="flex justify-between items-center gap-3 py-3 border-t border-hairline first:border-t-0 hover:bg-brand-wash rounded-[9px] px-2 -mx-2"
            >
              <span>
                <b className="block text-[14.5px]">{l.headline ?? `${l.city} listing`}</b>
                <span className="text-[12.5px] text-ink-2">
                  {l.city}, {l.state}
                  {l.aadt_sum !== null && ` · ${fmt(l.aadt_sum)} vehicles/day`}
                </span>
              </span>
              <span className="flex items-center gap-2.5 shrink-0">
                {l.signalized && <Badge>🚦</Badge>}
                <span className="text-right">
                  <b className="block text-[16px]">{money(l.monthly_rate)}</b>
                  <span className="text-[11.5px] text-ink-3">{l.status}</span>
                </span>
              </span>
            </a>
          ))}
        </Card>
      )}
    </div>
  );
}
