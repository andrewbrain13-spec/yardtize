/**
 * Rate suggestion v1.
 *
 *   monthly impressions = AADT × DAYS_PER_MONTH
 *   visible impressions = monthly impressions × VISIBILITY_FACTOR
 *   suggested           = clamp(round_to_5(visible / 1000 × CPM × multipliers))
 *
 * Two things make this defensible rather than a fudge:
 *
 * CPM means cost per thousand *impressions*, and AADT counts vehicles per
 * *day*, so a monthly price has to multiply by the days in the month. An
 * earlier version skipped that and quietly priced a single day as if it were a
 * month.
 *
 * Multiplying by 30 alone, though, prices a 3 sq ft yard sign as if every
 * passing driver read it like a billboard — which put the anchor corner at
 * roughly $7,600 a month, above mid-metro billboard rates. Outdoor advertising
 * handles this with visibility-adjusted impressions: only a fraction of passing
 * traffic actually registers a given piece of inventory, and a small sign at
 * eye level earns a small fraction. That fraction is stated here as one number
 * rather than buried in a rounded-down CPM, so it can be argued about, tested
 * against real bookings, and raised as the market proves itself.
 */

/** Cost per thousand visible impressions. */
export const CPM = 4;

/** Billing month used to turn a daily traffic count into monthly impressions. */
export const DAYS_PER_MONTH = 30;

/**
 * Share of passing traffic credited as actually registering the sign.
 *
 * The out-of-home industry calls this a Visibility Adjustment Index, and
 * Geopath derives real ones from eye-tracking studies weighing sign size,
 * distance from the road, road type and illumination. Those figures are not
 * published, and no public rate card exists for renting a residential yard, so
 * this number is a business decision rather than a measured constant — set
 * deliberately high because a yard sign sits at eye level and, on a signalized
 * corner, in front of stopped traffic.
 *
 * It is worth knowing which way the evidence we do have points. The informal
 * market clears at \$10-50/month for an ordinary yard, and Grass Spaces asks
 * \$30-40/week; at 75% an ordinary 5,000-vehicle street prices near
 * \$450/month, several times either. Against that, a much lower factor
 * flattened every street between 1,000 and 10,000 vehicles onto the price
 * floor, which is precisely the range most homeowners live on and left the
 * engine unable to tell those yards apart at all.
 *
 * Revisit once real bookings — or a proper visibility study — say otherwise.
 */
export const VISIBILITY_FACTOR = 0.75;

export const RATE_FLOOR = 40;
/**
 * Raised alongside the visibility factor: at 75% a premium signalized corner
 * prices near \$5,700, so a \$600 cap would have pinned every good listing to
 * the same number and hidden the differences the engine exists to surface.
 */
export const RATE_CEILING = 6000;

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
  /** The published figure, in whole dollars per month. */
  monthly: number;
  /** Vehicle passes per month before any visibility adjustment. */
  monthlyImpressions: number;
  /** Impressions credited after the visibility adjustment. */
  visibleImpressions: number;
  /** Price from traffic alone, before multipliers. */
  base: number;
  applied: Array<{ factor: RateFactor; label: string; multiplier: number }>;
  /** After multipliers, before rounding and clamping. */
  raw: number;
  clamped: boolean;
};

const roundToNearest5 = (n: number) => Math.round(n / 5) * 5;

export function suggestRate(input: RateInput): RateBreakdown {
  const monthlyImpressions = input.aadtSum * DAYS_PER_MONTH;
  const visibleImpressions = monthlyImpressions * VISIBILITY_FACTOR;
  const base = (visibleImpressions / 1000) * CPM;

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

  return {
    monthly,
    monthlyImpressions: Math.round(monthlyImpressions),
    visibleImpressions: Math.round(visibleImpressions),
    base,
    applied,
    raw,
    clamped: monthly !== rounded,
  };
}
