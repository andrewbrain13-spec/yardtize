/**
 * Rate suggestion v1 — see CLAUDE.md "Rate suggestion v1".
 *
 *   suggested = clamp(round_to_5(AADT_sum / 1000 * $6), $40, $600)
 *
 * with multipliers for a signalized intersection, a corner lot, and the
 * election window. Multipliers apply to the raw figure; rounding and clamping
 * happen last so the published number is always a clean $5 step inside the band.
 *
 * The brand promise is that the math is visible, so `suggestRate` returns the
 * full working, not just the answer.
 */

export const CPM_PER_1K_VEHICLES = 6;
export const RATE_FLOOR = 40;
export const RATE_CEILING = 600;

export const MULTIPLIERS = {
  signalized: 1.25,
  cornerLot: 1.15,
  electionWindow: 1.6,
} as const;

export type RateFactor = keyof typeof MULTIPLIERS;

export const FACTOR_LABELS: Record<RateFactor, string> = {
  signalized: "Signalized intersection",
  cornerLot: "Corner lot",
  electionWindow: "Election window",
};

export type RateInput = {
  /** Sum of ROADWAY_AADT (both directions) for the segments this yard fronts. */
  aadtSum: number;
  signalized?: boolean;
  cornerLot?: boolean;
  electionWindow?: boolean;
};

export type RateBreakdown = {
  /** The final published figure, in whole dollars per month. */
  monthly: number;
  /** Traffic value before any multiplier, unrounded. */
  base: number;
  /** Which multipliers were applied, in order. */
  applied: Array<{ factor: RateFactor; label: string; multiplier: number }>;
  /** After multipliers, before rounding and clamping. */
  raw: number;
  clamped: boolean;
};

const roundToNearest5 = (n: number) => Math.round(n / 5) * 5;

export function suggestRate(input: RateInput): RateBreakdown {
  const base = (input.aadtSum / 1000) * CPM_PER_1K_VEHICLES;

  const applied = (Object.keys(MULTIPLIERS) as RateFactor[])
    .filter((factor) => input[factor])
    .map((factor) => ({
      factor,
      label: FACTOR_LABELS[factor],
      multiplier: MULTIPLIERS[factor],
    }));

  const raw = applied.reduce((acc, { multiplier }) => acc * multiplier, base);
  const rounded = roundToNearest5(raw);
  const monthly = Math.min(Math.max(rounded, RATE_FLOOR), RATE_CEILING);

  return { monthly, base, applied, raw, clamped: monthly !== rounded };
}
