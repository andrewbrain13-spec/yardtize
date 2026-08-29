import { createClient } from "@/lib/supabase/server";
import type { LatLng } from "./geo";
import { lookupKansasTraffic } from "./kansas";
import { lookupNationalTraffic } from "./hpms";
import { lookupMissouriTraffic } from "./modot";
import type { TrafficLookup } from "./types";

export type { LatLng } from "./geo";
export type { CountedSegment, TrafficLookup } from "./types";

/** ~11 m of precision — fine enough that a re-dragged pin reuses the cache. */
const KEY_DP = 4;
const CACHE_TTL_DAYS = 30;

const roundKey = (n: number) => Number(n.toFixed(KEY_DP));

/**
 * Traffic counts for a sign pin, from whichever state publishes that road.
 *
 * Every result is cached in Postgres by rounded coordinate. That keeps repeat
 * pins instant, and — more importantly for a live demo — means a placement
 * whose numbers we have already fetched keeps working even if MoDOT or KDOT is
 * down at the moment someone is watching.
 */
export async function lookupTraffic(
  point: LatLng,
  state: string,
  options: { skipCache?: boolean; signal?: AbortSignal } = {},
): Promise<TrafficLookup & { cached: boolean }> {
  const latKey = roundKey(point.lat);
  const lngKey = roundKey(point.lng);

  if (!options.skipCache) {
    const hit = await readCache(latKey, lngKey);
    if (hit) return { ...hit, cached: true };
  }

  /*
   * Which source answers for this address.
   *
   * Missouri and Kansas run their own services, which are fresher and carry
   * real street names, so they are asked first in their own states. Everywhere
   * else goes to FHWA's national dataset.
   *
   * That last branch used to send every other state to MoDOT, which answered
   * for a Colorado address by finding nothing in Missouri — a silent wrong
   * answer, and the one an investor typing their own address would hit.
   */
  const usState = state.trim().toUpperCase();
  const lookup =
    usState === "KS"
      ? await lookupKansasTraffic(point, { signal: options.signal })
      : usState === "MO"
        ? await lookupMissouriTraffic(point, { signal: options.signal })
        : await lookupNationalTraffic(point, { signal: options.signal });

  // Only cache real answers. A "no data" result may just mean the state
  // server was briefly unreachable, and we do not want to freeze that in.
  if (lookup.aadtSum !== null) {
    await writeCache(latKey, lngKey, lookup);
  }

  return { ...lookup, cached: false };
}

async function readCache(latKey: number, lngKey: number): Promise<TrafficLookup | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("aadt_cache")
      .select("aadt_sum, segments, source, data_year, fetched_at")
      .eq("lat_key", latKey)
      .eq("lng_key", lngKey)
      .maybeSingle();

    if (!data) return null;

    const ageDays = (Date.now() - new Date(data.fetched_at).getTime()) / 86_400_000;
    if (ageDays > CACHE_TTL_DAYS) return null;

    const segments = (data.segments ?? []) as TrafficLookup["segments"];
    return {
      aadtSum: data.aadt_sum,
      segments,
      nearby: segments,
      source: data.source,
      year: data.data_year,
    };
  } catch {
    // A cache miss must never break the lookup itself.
    return null;
  }
}

async function writeCache(latKey: number, lngKey: number, lookup: TrafficLookup) {
  try {
    const supabase = await createClient();
    await supabase.from("aadt_cache").upsert(
      {
        lat_key: latKey,
        lng_key: lngKey,
        aadt_sum: lookup.aadtSum,
        segments: lookup.segments,
        source: lookup.source,
        data_year: lookup.year,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lat_key,lng_key" },
    );
  } catch {
    // Caching is an optimisation; failing to write it is not an error.
  }
}
