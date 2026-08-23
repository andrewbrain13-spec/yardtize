import type { Metadata } from "next";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "@/components/WaitlistForm";
import type { Jurisdiction } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Where Yardtize operates — Yardtize",
  description:
    "The cities whose sign codes Yardtize has read line by line, what each one allows, and how to ask for yours.",
};

/**
 * Public proof of the compliance work.
 *
 * The claim "we screen against your city's actual sign code" is worth more when
 * a reader can see which cities, what each allows, and which sections it came
 * from. It is also the honest place to say how small the map still is.
 */
export default async function CoveragePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jurisdictions")
    .select("*")
    .order("state")
    .order("name");

  const all = (data ?? []) as Jurisdiction[];
  const verified = all.filter((j) => j.is_verified && !j.is_default);
  const started = all.filter((j) => !j.is_verified && !j.is_default);

  return (
    <div className="max-w-[900px] mx-auto px-[26px] py-[64px]">
      <h1 className="text-[32px] tracking-[-0.7px]">Where Yardtize operates</h1>
      <p className="text-ink-2 mt-3 text-[16px] max-w-[58ch]">
        Every placement is screened against the sign code of the city it sits
        in. That only works where somebody has actually read the code, so this
        page says plainly where that has happened.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        {verified.map((j) => {
          const r = j.rules;
          const lane = r.commercial_offpremise_allowed
            ? "Open to commercial advertisers"
            : r.weekend_corner?.allowed
              ? "Weekend corner for commercial · campaigns and nonprofits year-round"
              : r.nonprofit_exempt
                ? "Campaigns and nonprofits · no off-site commercial"
                : "Campaigns and causes · no off-site commercial";

          return (
            <Card key={j.id} className="p-[22px]">
              <div className="flex items-start justify-between gap-2.5 mb-2">
                <h2 className="text-[18px] tracking-[-0.3px]">
                  {j.name}, {j.state}
                </h2>
                <Badge>Verified</Badge>
              </div>
              <p className="text-[13.5px] text-ink-2">
                <b className="text-ink">{r.max_sign_sqft} sq ft</b> max,{" "}
                <b className="text-ink">{r.max_height_ft} ft</b> tall
                {r.setback_ft ? `, ${r.setback_ft} ft off the right-of-way` : ""}
                {r.display_period_days
                  ? `. Displays run ${r.display_period_days} days${r.gap_days ? ` with a ${r.gap_days}-day gap` : ""}.`
                  : "."}
              </p>
              <p className="text-[13px] text-ink-2 mt-2">{lane}</p>
              {j.citations.length > 0 && (
                <p className="text-[11.5px] text-ink-3 mt-2.5 break-words">
                  {j.citations.join(" · ")}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {started.length > 0 && (
        <Card className="p-[22px] mt-4">
          <h2 className="text-[17px] tracking-[-0.3px] mb-1">Under review</h2>
          <p className="text-[13px] text-ink-2 mb-2.5 max-w-[58ch]">
            You can list a yard in these cities today. Until the code is
            verified, placements are held to conservative limits and carry a
            review-pending badge, and no commercial advertiser is offered them.
          </p>
          <p className="text-[13.5px]">
            {started.map((j) => `${j.name}, ${j.state}`).join(" · ")}
          </p>
        </Card>
      )}

      <Card className="p-[26px] sm:p-[32px] mt-8">
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div>
            <h2 className="text-[20px] tracking-[-0.4px]">Somewhere else?</h2>
            <p className="text-ink-2 mt-2 text-[14.5px] max-w-[46ch]">
              The traffic data behind our pricing is public in all fifty states —
              it&rsquo;s the sign codes that have to be read one city at a time.
              Tell us where you are and we&rsquo;ll read yours next. Demand is
              how we pick the order.
            </p>
          </div>
          <div>
            <WaitlistForm source="coverage" label="Add my city" />
          </div>
        </div>
      </Card>

      <div className="mt-8">
        <ButtonLink href="/list" size="big">
          List your yard →
        </ButtonLink>
      </div>
    </div>
  );
}
