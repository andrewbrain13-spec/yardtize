import type { LatLng, Path } from "./geo";

export type ArcGisFeature<A> = {
  attributes: A;
  geometry?: { paths: Path[] };
};

/**
 * Point-radius query against an ArcGIS REST layer, returning features with
 * geometry in WGS84 so we can measure the distance to the sign pin ourselves.
 */
export async function queryNearby<A>(
  layerUrl: string,
  point: LatLng,
  opts: {
    radiusMeters: number;
    where: string;
    outFields: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<ArcGisFeature<A>[]> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({
      x: point.lng,
      y: point.lat,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    distance: String(opts.radiusMeters),
    units: "esriSRUnit_Meter",
    spatialRel: "esriSpatialRelIntersects",
    where: opts.where,
    outFields: opts.outFields,
    returnGeometry: "true",
    f: "json",
  });

  // These are third-party government servers of varying reliability, so every
  // call is bounded — a slow state DOT must never hang the listing wizard.
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 12_000);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;

  const res = await fetch(`${layerUrl}/query?${params}`, { signal });
  if (!res.ok) throw new Error(`${layerUrl} returned ${res.status}`);

  const body = await res.json();
  if (body.error) throw new Error(`${layerUrl}: ${body.error.message ?? "query failed"}`);
  return (body.features ?? []) as ArcGisFeature<A>[];
}
