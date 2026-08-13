/**
 * The anchor demo property: 3103 Karnes Blvd, Kansas City, MO 64111 —
 * the corner of SW Trafficway & W 31st St.
 *
 * These traffic counts are REAL, verified 2025 MoDOT figures (see
 * Yardtize-Zoning-Deep-Dive.md §1). Per the build guardrails they may be
 * presented as real; everything else we seed must carry a demo-data label.
 */

export const KARNES = {
  address: "3103 Karnes Blvd",
  city: "Kansas City",
  state: "MO",
  postalCode: "64111",
  lat: 39.0716,
  lng: -94.5947,
  intersection: "SW Trafficway & W 31st St",
  signalized: true,
  cornerLot: true,
  jurisdiction: "Kansas City, MO",
} as const;

export type TrafficSegment = {
  road: string;
  descriptor: string;
  /** ROADWAY_AADT — both directions. */
  aadt: number;
  year: number;
  source: string;
  /** Counted toward the listing's headline figure. */
  counted: boolean;
};

export const KARNES_SEGMENTS: TrafficSegment[] = [
  {
    road: "SW Trafficway",
    descriptor: "south of the 31st St signal",
    aadt: 33316,
    year: 2025,
    source: "MoDOT",
    counted: true,
  },
  {
    road: "W 31st St",
    descriptor: "at SW Trafficway",
    aadt: 11070,
    year: 2025,
    source: "MoDOT",
    counted: true,
  },
  {
    road: "SW Trafficway",
    descriptor: "north of the 31st St signal",
    aadt: 25244,
    year: 2025,
    source: "MoDOT",
    counted: false,
  },
];

/**
 * Headline vehicles/day for the corner. We count the heaviest Trafficway
 * segment plus the cross street; the second Trafficway segment is the same
 * road either side of the same signal, so counting both would double-count
 * the through traffic.
 */
export const KARNES_AADT_SUM = KARNES_SEGMENTS.filter((s) => s.counted).reduce(
  (sum, s) => sum + s.aadt,
  0,
);

export const KARNES_TRAFFIC_SOURCE = "MoDOT 2025";
