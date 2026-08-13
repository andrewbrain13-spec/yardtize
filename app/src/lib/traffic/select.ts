import { bearingDelta } from "./geo";
import type { CountedSegment, TrafficLookup } from "./types";

/**
 * Two segments count as the same road when their headings are within this many
 * degrees — loose enough to absorb a curve, tight enough to separate the two
 * legs of an intersection.
 */
export const SAME_ROAD_DEGREES = 25;

/** A corner fronts at most this many distinct roads. */
export const MAX_ROADS = 2;

/**
 * Turns a pile of raw DOT segments into the headline figure.
 *
 * Every one of these datasets repeats a physical roadway once per direction of
 * travel, with both rows carrying the same both-directions total, and several
 * publish coincident rows at intersections that carry the *cross* street's
 * name. Adding those up would inflate a corner's traffic several times over, so
 * we collapse duplicates and then keep only the nearest count on each distinct
 * road, telling roads apart by heading rather than by name.
 */
export function selectHeadlineSegments(
  candidates: CountedSegment[],
  source: string,
  year: number | null,
): TrafficLookup {
  if (!candidates.length) {
    return {
      aadtSum: null,
      segments: [],
      nearby: [],
      source: null,
      year,
      note: "No official traffic count was published for the roads at this location.",
    };
  }

  const sorted = [...candidates].sort((a, b) => a.distanceMeters - b.distanceMeters);

  const deduped: CountedSegment[] = [];
  for (const c of sorted) {
    const isDuplicate = deduped.some(
      (d) =>
        d.roadwayAadt === c.roadwayAadt &&
        bearingDelta(d.bearing, c.bearing) < SAME_ROAD_DEGREES,
    );
    if (!isDuplicate) deduped.push(c);
  }

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
    source,
    year,
  };
}
