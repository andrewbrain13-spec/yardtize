import { queryNearby } from "./arcgis";
import { bearingOf, distanceToPaths, type LatLng } from "./geo";
import { selectHeadlineSegments } from "./select";
import type { CountedSegment, TrafficLookup } from "./types";

const BASE =
  "https://mapping.modot.mo.gov/arcgis/rest/services/BusinessInt/TrafficInfoSegAADT/MapServer";

/** Directional all-roads layers: North, South, East, West. */
const LAYERS = [16, 17, 18, 19];

const RADIUS_M = 200;

type Attrs = {
  TRAVELWAY_NAME: string | null;
  ROADWAY_AADT: number | null;
  YEAR: number | null;
};

let cachedYear: { value: number; at: number } | null = null;
const YEAR_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Newest published YEAR. MoDOT keeps one row per segment per year going back
 * to 1999, so querying without this filter would mix decades of counts.
 */
export async function latestModotYear(signal?: AbortSignal): Promise<number> {
  if (cachedYear && Date.now() - cachedYear.at < YEAR_TTL_MS) return cachedYear.value;

  const params = new URLSearchParams({
    where: "1=1",
    outStatistics: JSON.stringify([
      { statisticType: "max", onStatisticField: "YEAR", outStatisticFieldName: "maxyear" },
    ]),
    f: "json",
  });

  const res = await fetch(`${BASE}/${LAYERS[0]}/query?${params}`, {
    signal: signal ?? AbortSignal.timeout(10_000),
  });
  const body = await res.json();
  const year = Number(body?.features?.[0]?.attributes?.MAXYEAR);
  if (!year) throw new Error("Could not determine MoDOT's latest data year");

  cachedYear = { value: year, at: Date.now() };
  return year;
}

/**
 * Nearest counted road segments to a sign pin, from MoDOT's all-roads AADT.
 *
 * Quirks this handles, all confirmed against the live service at the anchor
 * property: street names are unreliable (coincident rows at an intersection
 * carry the cross street's name), each roadway appears once per direction with
 * the same both-directions total, and some segments carry AADT 0 or a stale
 * year. Selection is done by distance and heading in selectHeadlineSegments.
 */
export async function lookupMissouriTraffic(
  point: LatLng,
  options: { year?: number; signal?: AbortSignal } = {},
): Promise<TrafficLookup> {
  const year = options.year ?? (await latestModotYear(options.signal));

  const results = await Promise.all(
    LAYERS.map((layer) =>
      queryNearby<Attrs>(`${BASE}/${layer}`, point, {
        radiusMeters: RADIUS_M,
        where: `YEAR=${year}`,
        outFields: "TRAVELWAY_NAME,ROADWAY_AADT,YEAR",
        signal: options.signal,
      }).catch(() => []),
    ),
  );

  const candidates: CountedSegment[] = [];
  for (const feature of results.flat()) {
    const paths = feature.geometry?.paths;
    const aadt = feature.attributes.ROADWAY_AADT;
    // Treat 0/null as no data rather than as a real count of zero.
    if (!paths?.length || !aadt || aadt <= 0) continue;

    candidates.push({
      road: feature.attributes.TRAVELWAY_NAME?.trim() || "Unnamed road",
      roadwayAadt: Math.round(aadt),
      year: feature.attributes.YEAR ?? year,
      source: "MoDOT",
      distanceMeters: Math.round(distanceToPaths(point, paths) * 10) / 10,
      bearing: bearingOf(paths),
    });
  }

  return selectHeadlineSegments(candidates, "MoDOT", year);
}
