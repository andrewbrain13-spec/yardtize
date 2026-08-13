/** Normalised shape returned by every state DOT adapter. */

export type CountedSegment = {
  /** Street name as published. Unreliable at intersections — display only. */
  road: string;
  /** Both-directions volume. This is the number we show and price on. */
  roadwayAadt: number;
  year: number;
  /** e.g. "MoDOT" or "KDOT". */
  source: string;
  /** Metres from the sign pin to the nearest point on this segment. */
  distanceMeters: number;
  /** 0–180° heading, used to group segments onto distinct roads. */
  bearing: number;
};

export type TrafficLookup = {
  /** Sum of the nearest counted segment on each distinct road. Null = no data. */
  aadtSum: number | null;
  /** The segments that make up aadtSum, nearest first. */
  segments: CountedSegment[];
  /** Every counted segment found nearby, including ones not summed. */
  nearby: CountedSegment[];
  source: string | null;
  year: number | null;
  /** Set when the lookup ran but found nothing countable. */
  note?: string;
};

export const NO_TRAFFIC_DATA: TrafficLookup = {
  aadtSum: null,
  segments: [],
  nearby: [],
  source: null,
  year: null,
  note: "No official traffic count was published for the roads at this location.",
};
