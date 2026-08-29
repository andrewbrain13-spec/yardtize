import { queryNearby } from "./arcgis";
import { hpmsSegments } from "./hpms";
import { bearingOf, distanceToPaths, type LatLng } from "./geo";
import { selectHeadlineSegments } from "./select";
import type { CountedSegment, TrafficLookup } from "./types";

const KDOT_STATE =
  "https://wfs.ksdot.org/arcgis_web_adaptor/rest/services/Transportation/AADT_Flow_Map/FeatureServer/0";
const KDOT_NONSTATE =
  "https://wfs.ksdot.org/arcgis_web_adaptor/rest/services/Transportation/AADT_NonState/FeatureServer/0";

const RADIUS_M = 250;

type KdotAttrs = {
  AADT?: number | null;
  COUNT_YEAR?: number | null;
  YEAR?: number | null;
  ROUTE_NAME?: string | null;
  STREET_NAME?: string | null;
  LOCAL_NAME?: string | null;
};

async function fromKdot(point: LatLng, signal?: AbortSignal): Promise<CountedSegment[]> {
  const layers = [KDOT_STATE, KDOT_NONSTATE];
  const results = await Promise.all(
    layers.map((url) =>
      queryNearby<KdotAttrs>(url, point, {
        radiusMeters: RADIUS_M,
        where: "1=1",
        outFields: "*",
        signal,
        timeoutMs: 8_000,
      }).catch(() => []),
    ),
  );

  const segments: CountedSegment[] = [];
  for (const feature of results.flat()) {
    const paths = feature.geometry?.paths;
    const a = feature.attributes;
    const aadt = a.AADT;
    if (!paths?.length || !aadt || aadt <= 0) continue;

    segments.push({
      road: a.ROUTE_NAME || a.STREET_NAME || a.LOCAL_NAME || "Classified road",
      roadwayAadt: Math.round(aadt),
      year: a.COUNT_YEAR ?? a.YEAR ?? 0,
      source: "KDOT",
      distanceMeters: Math.round(distanceToPaths(point, paths) * 10) / 10,
      bearing: bearingOf(paths),
    });
  }
  return segments;
}

/**
 * Kansas traffic counts.
 *
 * KDOT is the preferred source — it carries real street names, non-state
 * arterials, and a fresher count year. Its public service is unreliable, so we
 * fall through to FHWA's national dataset, which is the same federally
 * reported data a few years behind.
 *
 * Purely residential Kansas streets are not counted by anybody; in that case
 * the honest answer is the nearest classified road, labelled as such.
 */
export async function lookupKansasTraffic(
  point: LatLng,
  options: { signal?: AbortSignal } = {},
): Promise<TrafficLookup> {
  let segments = await fromKdot(point, options.signal).catch(() => []);
  let source = "KDOT";

  if (!segments.length) {
    segments = await hpmsSegments(point, options.signal).catch(() => []);
    source = "FHWA HPMS";
  }

  const year = segments.length
    ? Math.max(...segments.map((s) => s.year).filter(Boolean))
    : null;

  return selectHeadlineSegments(segments, source, year || null);
}
