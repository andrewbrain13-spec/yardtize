import type { Metadata } from "next";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { evaluateAdvertiserFit, evaluateCompliance } from "@/lib/compliance";
import type { AdvertiserType, Jurisdiction, PublicListing } from "@/lib/supabase/types";
import { Portal, type PortalListing } from "./Portal";

export const metadata: Metadata = { title: "Yards for your business — Yardtize" };

const TYPES: AdvertiserType[] = ["business", "campaign", "nonprofit"];

export default async function BrowsePage() {
  const supabase = await createClient();
  const session = await getSessionProfile().catch(() => null);

  /*
   * listings_public, not listings: the base table no longer hands a whole row
   * to anyone who asks. The view carries what the marketplace is shopped on and
   * leaves out the street address and the exact pin — see migration 0006.
   */
  const { data: rows } = await supabase
    .from("listings_public")
    .select("*")
    .order("aadt_sum", { ascending: false, nullsFirst: false });

  const listings = (rows ?? []) as PublicListing[];

  const ids = [...new Set(listings.map((l) => l.jurisdiction_id).filter(Boolean))] as string[];
  const { data: jRows } = ids.length
    ? await supabase.from("jurisdictions").select("*").in("id", ids)
    : { data: [] };
  const byId = new Map((jRows ?? []).map((j) => [j.id, j as Jurisdiction]));

  const prepared: PortalListing[] = listings.map((l) => {
    const j = l.jurisdiction_id ? byId.get(l.jurisdiction_id) : undefined;
    const report = j ? evaluateCompliance(j, { cornerLot: l.corner_lot }) : null;

    return {
      id: l.id,
      headline: l.headline ?? `${l.city} frontage`,
      city: l.city,
      state: l.state,
      lat: l.lat,
      lng: l.lng,
      aadt: l.aadt_sum,
      trafficSource: l.traffic_source,
      trafficYear: l.traffic_year,
      segments: (l.traffic_segments ?? []).map((s) => ({
        road: s.road,
        aadt: s.aadt,
        source: s.source,
        year: s.year,
      })),
      rate: l.monthly_rate,
      signalized: l.signalized,
      cornerLot: l.corner_lot,
      isDemo: l.is_demo,
      jurisdictionName: j ? `${j.name}, ${j.state}` : "Compliance review pending",
      complianceChecks: report?.checks ?? [],
      sizes: (report?.allowedSizes ?? []).map((s) => ({ label: s.label, sqft: s.sqft })),
      fits: Object.fromEntries(
        TYPES.map((t) => [
          t,
          j
            ? evaluateAdvertiserFit(j, t, l.corner_lot)
            : {
                allowed: false,
                reason: "We haven't verified this city's sign code yet, so placements aren't offered here.",
              },
        ]),
      ) as PortalListing["fits"],
    };
  });

  return (
    <Portal
      listings={prepared}
      mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
      userId={session?.user?.id ?? null}
    />
  );
}
