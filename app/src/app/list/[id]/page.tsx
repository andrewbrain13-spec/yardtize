import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { evaluateCompliance } from "@/lib/compliance";
import { money } from "@/lib/money";
import type { Jurisdiction, TrafficSegmentRow } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Your listing — Yardtize" };

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ published?: string }>;
}) {
  const { id } = await params;
  const { published } = await searchParams;

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!listing) notFound();

  // Fetched separately rather than as an embedded join: our hand-written
  // database types declare no relationships, so the join loses all typing.
  let jurisdiction: Jurisdiction | null = null;
  if (listing.jurisdiction_id) {
    const { data } = await supabase
      .from("jurisdictions")
      .select("*")
      .eq("id", listing.jurisdiction_id)
      .maybeSingle();
    jurisdiction = data;
  }

  const compliance = jurisdiction
    ? evaluateCompliance(jurisdiction, { cornerLot: listing.corner_lot })
    : null;
  const segments = (listing.traffic_segments ?? []) as TrafficSegmentRow[];

  return (
    <div className="max-w-[860px] mx-auto px-[26px] py-[60px]">
      {published && (
        <Card className="p-[26px] mb-5 text-center">
          <div className="grid place-items-center w-[62px] h-[62px] mx-auto mb-3.5 rounded-full bg-brand-wash-2 text-good-text text-[28px]">
            ✓
          </div>
          <h1 className="text-[25px] tracking-[-0.4px]">Your yard is live on Yardtize</h1>
          <p className="text-ink-2 mt-2.5 max-w-[46ch] mx-auto">
            We&rsquo;ll let you know the moment a business or campaign requests
            your corner. You approve every advertiser before anything goes up.
          </p>
        </Card>
      )}

      <Card className="p-[26px]">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <h2 className="text-[20px] tracking-[-0.3px]">{listing.headline}</h2>
            <p className="text-[12.5px] text-ink-3 mt-1">
              {listing.city}, {listing.state}
              {listing.is_demo && " · demo listing"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {listing.signalized && <Badge tone="gold">🚦 Signalized</Badge>}
            {listing.corner_lot && <Badge>Corner lot</Badge>}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <div className="border border-hairline rounded-[10px] px-3.5 py-3">
            <div className="text-[11.5px] text-ink-3 font-medium">Vehicles per day</div>
            <div className="text-[21px] font-bold">
              {listing.aadt_sum === null ? "No data" : fmt(listing.aadt_sum)}
            </div>
            <div className="text-[11.5px] text-ink-2">
              {listing.traffic_source
                ? `${listing.traffic_source} ${listing.traffic_year ?? ""}`.trim()
                : "not published for this road"}
            </div>
          </div>
          <div className="border border-hairline rounded-[10px] px-3.5 py-3">
            <div className="text-[11.5px] text-ink-3 font-medium">Monthly rate</div>
            <div className="text-[21px] font-bold">{money(listing.monthly_rate)}</div>
            <div className="text-[11.5px] text-ink-2">
              {listing.suggested_rate && listing.suggested_rate !== listing.monthly_rate
                ? `you set this · suggested ${money(listing.suggested_rate)}`
                : "set by you"}
            </div>
          </div>
          <div className="border border-hairline rounded-[10px] px-3.5 py-3">
            <div className="text-[11.5px] text-ink-3 font-medium">Max sign</div>
            <div className="text-[21px] font-bold">
              {compliance ? `${compliance.maxOfferedSqft} ft²` : "—"}
            </div>
            <div className="text-[11.5px] text-ink-2">city-compliant</div>
          </div>
        </div>

        {segments.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[14.5px] font-bold mb-2">Roads counted</h3>
            {segments.map((s) => (
              <div key={`${s.road}-${s.aadt}`} className="flex justify-between py-2 border-t border-hairline text-[13.5px]">
                <span className="font-semibold">{s.road}</span>
                <span className="tabular-nums font-bold">
                  {fmt(s.aadt)}
                  <span className="text-ink-3 font-normal text-[11.5px] ml-1.5">
                    {s.source} {s.year}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {compliance && (
          <div className="mt-5">
            <h3 className="text-[14.5px] font-bold mb-2">
              Compliance — {compliance.jurisdiction.name}, {compliance.jurisdiction.state}
            </h3>
            {compliance.checks.map((c) => (
              <div key={c.label} className="flex gap-2.5 py-1.5 text-[13.5px] items-start">
                <span
                  className={`shrink-0 grid place-items-center w-[18px] h-[18px] mt-0.5 rounded-full text-[11px] font-extrabold ${
                    c.status === "pass"
                      ? "bg-brand-wash-2 text-good-text"
                      : c.status === "warn"
                        ? "bg-amber-wash text-amber"
                        : "bg-biz-wash text-biz"
                  }`}
                >
                  {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "i"}
                </span>
                <span className="text-ink-2">{c.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2.5 mt-6 flex-wrap">
          <ButtonLink href="/dashboard" variant="ghost">Your account</ButtonLink>
          <ButtonLink href="/list/new" variant="ghost">List another property</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
