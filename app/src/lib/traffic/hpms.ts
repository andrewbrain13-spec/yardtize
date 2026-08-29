import { queryNearby } from "./arcgis";
import { bearingOf, distanceToPaths, type LatLng } from "./geo";
import { selectHeadlineSegments } from "./select";
import type { CountedSegment, TrafficLookup } from "./types";

/**
 * FHWA's Highway Performance Monitoring System — every state, one service.
 *
 * This is what makes Yardtize answer "does it work in my city?" with a number
 * instead of a shrug. Every state reports AADT to FHWA on the same schedule
 * and in the same shape, so one query covers all fifty; the pilot is Kansas
 * City because that is where the supply is, not because the data stops there.
 *
 * It is a backstop, never a first choice. The counts here run several years
 * behind — Kansas City comes back 2020 where MoDOT publishes 2025 — so a state
 * that runs its own service is always asked first, and this catches everywhere
 * else and everything that fails.
 *
 * The endpoint moved. We previously used per-state extracts at
 * geo.dot.gov/.../HPMS_FULL_<ST>_2023, which now return a server error for
 * every state including the one we shipped; the national view below is live
 * and additionally carries ROUTE_NAME, which the per-state files did not.
 */
const HPMS_NATIONAL =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/hpms_v2_view/FeatureServer/0";

const RADIUS_M = 250;

export type HpmsAttrs = {
  AADT?: number | null;
  Year_Record?: number | null;
  ROUTE_NAME?: string | null;
  ROUTE_NUMBER?: number | string | null;
  F_SYSTEM?: number | null;
  State?: string | null;
};

/**
 * HPMS functional classes, used to describe a road when it has no name.
 * Anything above 5 is a local street, which is essentially never counted.
 */
const F_SYSTEM_LABEL: Record<number, string> = {
  1: "Interstate",
  2: "Principal arterial (freeway)",
  3: "Principal arterial",
  4: "Minor arterial",
  5: "Major collector",
  6: "Minor collector",
  7: "Local road",
};

/*
 * States fill ROUTE_NAME and ROUTE_NUMBER with whatever their own systems
 * hold, and a good deal of it is not a road name. Tennessee returns bare
 * numbers like "3274"; Texas returns internal identifiers like 258521 in the
 * route-number field. Printing either gives a listing a road called 3274,
 * which reads as a bug and undermines the one thing this data is for.
 *
 * So a name has to look like a name — contain a letter — and a route number
 * has to be plausible as a signed route. Anything else falls back to the
 * functional class, which is always true even when it is not specific.
 */
const looksLikeName = (v: string): boolean => /[a-z]/i.test(v);

/*
 * Signed US routes run to three digits — I-70, US-69, K-10, and the rare
 * 900-series state route. Four digits and up is an internal identifier that
 * happens to live in the same column, so "Route 2810" and "Route 3274" both
 * came out of this field looking like roads a driver could find. They are not.
 */
const plausibleRoute = (v: number | string): boolean => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1000;
};

export function describeRoad(a: HpmsAttrs): string {
  const name = a.ROUTE_NAME?.trim();
  if (name && looksLikeName(name)) return name;
  if (a.ROUTE_NUMBER != null && plausibleRoute(a.ROUTE_NUMBER)) {
    return `Route ${a.ROUTE_NUMBER}`;
  }
  return (a.F_SYSTEM ? F_SYSTEM_LABEL[a.F_SYSTEM] : undefined) ?? "Classified road";
}

/** Counted segments near a point, from the national dataset. */
export async function hpmsSegments(
  point: LatLng,
  signal?: AbortSignal,
): Promise<CountedSegment[]> {
  const features = await queryNearby<HpmsAttrs>(HPMS_NATIONAL, point, {
    radiusMeters: RADIUS_M,
    where: "AADT>0",
    outFields: "AADT,Year_Record,ROUTE_NAME,ROUTE_NUMBER,F_SYSTEM,State",
    signal,
    // A national layer is slower to query than one state's extract.
    timeoutMs: 20_000,
  });

  const segments: CountedSegment[] = [];
  for (const feature of features) {
    const paths = feature.geometry?.paths;
    const a = feature.attributes;
    if (!paths?.length || !a.AADT || a.AADT <= 0) continue;

    segments.push({
      road: describeRoad(a),
      roadwayAadt: Math.round(a.AADT),
      /*
       * Year_Record comes back null on some states' submissions. Zero rather
       * than a guessed year: the display layer already treats a missing year
       * as unknown, and inventing one would put a date on the page that no
       * agency published.
       */
      year: a.Year_Record ?? 0,
      source: "FHWA HPMS",
      distanceMeters: Math.round(distanceToPaths(point, paths) * 10) / 10,
      bearing: bearingOf(paths),
    });
  }
  return segments;
}

/**
 * Traffic anywhere in the United States.
 *
 * Used for any state without a dedicated source. The answer is real federal
 * data with the year attached, so a reader can see for themselves how current
 * it is — which is the whole reason the year travels with every count.
 */
export async function lookupNationalTraffic(
  point: LatLng,
  options: { signal?: AbortSignal } = {},
): Promise<TrafficLookup> {
  const segments = await hpmsSegments(point, options.signal).catch(() => []);
  const years = segments.map((s) => s.year).filter(Boolean);
  return selectHeadlineSegments(segments, "FHWA HPMS", years.length ? Math.max(...years) : null);
}
