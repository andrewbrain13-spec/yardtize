import { bearingDelta, bearingOf, distanceToPaths, type LatLng, type Path } from "./geo";
import { NO_TRAFFIC_DATA, type CountedSegment, type TrafficLookup } from "./types";

const BASE =
  "https://mapping.modot.mo.gov/arcgis/rest/services/BusinessInt/TrafficInfoSegAADT/MapServer";

/** Directional all-roads layers: North, South, East, West. */
const LAYERS = [16, 17, 18, 19];

/** Search radius around the sign pin. */
const RADIUS_M = 200;

/**
 * Two segments are treated as the same road when their headings are within
 * this many degrees — enough to absorb a curve, tight enough to separate the
 * two legs of an intersection.
 */
const SAME_ROAD_DEGREES = 25;

/** A corner fronts at most this many distinct roads. */
const MAX_ROADS = 2;

type Feature = {
  attributes: {
    TRAVELWAY_NAME: string | null;
    ROADWAY_AADT: number | null;
    YEAR: number | null;
  };
  geometry?: { paths: Path[] };
};

async function queryLayer(
  layer: number,
  point: LatLng,
  year: number,
  signal?: AbortSignal,
): Promise<Feature[]> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({
      x: point.lng,
      y: point.lat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    distance: String(RADIUS_M),
    units: "esriSRUnit_Meter",
    spatialRel: "esriSpatialRelIntersects",
    where: `YEAR=${year}`,
    outFields: "TRAVELWAY_NAME,ROADWAY_AADT,YEAR",
    returnGeometry: "true",
    f: "json",
  });

  const res = await fetch(`${BASE}/${layer}/query?${params}`, { signal });
  if (!res.ok) throw new Error(`MoDOT layer ${layer} returned ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`MoDOT layer ${layer}: ${body.error.message}`);
  return (body.features ?? []) as Feature[];
}

/** Newest published YEAR across the all-roads layers. */
export async function latestModotYear(signal?: AbortSignal): Promise<number> {
  const params = new URLSearchParams({
    where: "1=1",
    outStatistics: JSON.stringify([
      { statisticType: "max", onStatisticField: "YEAR", outStatisticFieldName: "maxyear" },
    ]),
    f: "json",
  });
  const res = await fetch(`${BASE}/${LAYERS[0]}/query?${params}`, { signal });
  const body = await res.json();
  const year = body?.features?.[0]?.attributes?.MAXYEAR;
  if (!year) throw new Error("Could not determine MoDOT's latest data year");
  return Number(year);
}

/**
 * Nearest counted road segments to a sign pin, from MoDOT's all-roads AADT.
 *
 * Three quirks of this dataset drive the logic here:
 *  - Street names are unreliable. Coincident rows at an intersection can carry
 *    the *cross* street's name, so roads are told apart by heading, not name.
 *  - Every physical roadway appears once per direction, both rows carrying the
 *    same both-directions ROADWAY_AADT — so we must not add them twice.
 *  - Segments exist with AADT 0 or a stale year; those count as "no data" and
 *    we fall through to the next-nearest counted segment.
 */
export async function lookupMissouriTraffic(
  point: LatLng,
  options: { year?: number; signal?: AbortSignal } = {},
): Promise<TrafficLookup> {
  const year = options.year ?? (await latestModotYear(options.signal));

  const results = await Promise.all(
    LAYERS.map((layer) =>
      queryLayer(layer, point, year, options.signal).catch(() => [] as Feature[]),
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

  if (!candidates.length) return { ...NO_TRAFFIC_DATA, year };

  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Collapse the directional twins and coincident cross-street rows: anything
  // at the same distance carrying the same both-directions total is one road.
  const deduped: CountedSegment[] = [];
  for (const c of candidates) {
    const twin = deduped.find(
      (d) =>
        d.roadwayAadt === c.roadwayAadt &&
        Math.abs(d.distanceMeters - c.distanceMeters) < 1 &&
        bearingDelta(d.bearing, c.bearing) < SAME_ROAD_DEGREES,
    );
    if (!twin) deduped.push(c);
  }

  // Keep only the nearest count on each distinct road, up to a corner's worth.
  const chosen: CountedSegment[] = [];
  for (const c of deduped) {
    if (chosen.some((k) => bearingDelta(k.bearing, c.bearing) < SAME_ROAD_DEGREES)) continue;
    chosen.push(c);
    if (chosen.length === MAX_ROADS) break;
  }

  return {
    aadtSum: chosen.reduce((sum, s) => sum + s.roadwayAadt, 0),
    segments: chosen,
    nearby: deduped,
    source: "MoDOT",
    year,
  };
}
