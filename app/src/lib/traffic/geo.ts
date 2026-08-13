/** Small planar-approximation geometry helpers. Accurate enough at city scale. */

export type LatLng = { lat: number; lng: number };
/** ArcGIS returns polylines as [lng, lat] pairs. */
export type Path = Array<[number, number]>;

const M_PER_DEG = 111_320;

/** Shortest distance in metres from a point to a line segment. */
function pointToSegment(p: LatLng, a: [number, number], b: [number, number]): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const px = p.lng * k;
  const py = p.lat;
  const [ax, ay] = [a[0] * k, a[1]];
  const [bx, by] = [b[0] * k, b[1]];
  const dx = bx - ax;
  const dy = by - ay;

  let t = 0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG;
}

/** Shortest distance in metres from a point to any part of a multi-path polyline. */
export function distanceToPaths(point: LatLng, paths: Path[]): number {
  let best = Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const d = pointToSegment(point, path[i], path[i + 1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Overall heading of a polyline, normalised to 0–180°: a road running
 * north-south reads the same whether the geometry was digitised northbound or
 * southbound. Used to tell one road at an intersection from another without
 * trusting the (unreliable) street names.
 */
export function bearingOf(paths: Path[]): number {
  const flat = paths.flat();
  if (flat.length < 2) return 0;
  const [x1, y1] = flat[0];
  const [x2, y2] = flat[flat.length - 1];
  const k = Math.cos((y1 * Math.PI) / 180);
  const deg = (Math.atan2((x2 - x1) * k, y2 - y1) * 180) / Math.PI;
  return ((deg % 180) + 180) % 180;
}

/** Smallest angle between two 0–180° bearings. */
export function bearingDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}
