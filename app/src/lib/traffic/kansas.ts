import { queryNearby } from "./arcgis";
import { bearingOf, distanceToPaths, type LatLng } from "./geo";
import { selectHeadlineSegments } from "./select";
import type { CountedSegment, TrafficLookup } from "./types";

const KDOT_STATE =
  "https://wfs.ksdot.org/arcgis_web_adaptor/rest/services/Transportation/AADT_Flow_Map/FeatureServer/0";
const KDOT_NONSTATE =
  "https://wfs.ksdot.org/arcgis_web_adaptor/rest/services/Transportation/AADT_NonState/FeatureServer/0";

/** FHWA's national dataset — the backstop when KDOT is unavailable. */
const HPMS_KS =
  "https://geo.dot.gov/server/rest/services/Hosted/HPMS_FULL_KS_2023/FeatureServer/0";

const RADIUS_M = 250;

type KdotAttrs = {
  AADT?: number | null;
  COUNT_YEAR?: number | null;
  YEAR?: number | null;
  ROUTE_NAME?: string | null;
  STREET_NAME?: string | null;
  LOCAL_NAME?: string | null;
};

type HpmsAttrs = {
  aadt?: number | null;
  datayear?: number | null;
  route_number?: number | string | null;
  f_system?: number | null;
};

/**
 * HPMS functional classes. Anything above 5 is a local street, which is
 * effectively never counted — used to describe what we found, since HPMS
 * carries no usable street names.
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

async function fromHpms(point: LatLng, signal?: AbortSignal): Promise<CountedSegment[]> {
  const features = await queryNearby<HpmsAttrs>(HPMS_KS, point, {
    radiusMeters: RADIUS_M,
    where: "aadt>0",
    outFields: "aadt,datayear,route_number,f_system",
    signal,
    timeoutMs: 15_000,
  });

  const segments: CountedSegment[] = [];
  for (const feature of features) {
    const paths = feature.geometry?.paths;
    const a = feature.attributes;
    if (!paths?.length || !a.aadt || a.aadt <= 0) continue;

    // HPMS publishes no street names, only route numbers, so we describe the
    // road by its functional class rather than inventing a name.
    const label = a.f_system ? F_SYSTEM_LABEL[a.f_system] : undefined;

    segments.push({
      road: label ?? "Classified road",
      roadwayAadt: Math.round(a.aadt),
      year: a.datayear ?? 2023,
      source: "FHWA HPMS",
      distanceMeters: Math.round(distanceToPaths(point, paths) * 10) / 10,
      bearing: bearingOf(paths),
    });
  }
  return segments;
}

/**
 * Kansas traffic counts.
 *
 * KDOT is the preferred source — it carries real street names and non-state
 * arterials. Its public service is unreliable (and is currently unreachable),
 * so we fall through to FHWA's national HPMS dataset, which is the same
 * federally-reported data with route numbers instead of names.
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
    segments = await fromHpms(point, options.signal).catch(() => []);
    source = "FHWA HPMS";
  }

  const year = segments.length
    ? Math.max(...segments.map((s) => s.year).filter(Boolean))
    : null;

  return selectHeadlineSegments(segments, source, year || null);
}
