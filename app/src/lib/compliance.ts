import { createClient } from "@/lib/supabase/server";
import type { Jurisdiction, JurisdictionRules } from "@/lib/supabase/types";

/** The sign sizes Yardtize offers. Every one fits the strictest pilot limit. */
export const SIGN_SIZES = [
  { id: "18x24", label: '18 × 24 in — classic yard sign', sqft: 3 },
  { id: "24x36", label: "24 × 36 in — large format", sqft: 6 },
  { id: "24x48", label: "2 × 4 ft — maximum", sqft: 8 },
] as const;

export type SignSizeId = (typeof SIGN_SIZES)[number]["id"];

export type ComplianceCheck = {
  status: "pass" | "info" | "warn";
  label: string;
};

export type ComplianceReport = {
  jurisdiction: Jurisdiction;
  /** False when we are falling back to the conservative default row. */
  verified: boolean;
  checks: ComplianceCheck[];
  /** Largest size we will offer at this address, in square feet. */
  maxOfferedSqft: number;
  /** Sizes selectable here, narrowed to the city's limit. */
  allowedSizes: Array<(typeof SIGN_SIZES)[number]>;
  citations: string[];
};

/**
 * Finds the rules for an address. Phase 1 keys off the geocoder's city name;
 * a proper boundary lookup replaces this when we add more metros.
 */
export async function findJurisdiction(
  city: string,
  state: string,
): Promise<Jurisdiction | null> {
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("jurisdictions")
    .select("*")
    .eq("match_city", city.trim().toLowerCase())
    .eq("state", state.trim().toUpperCase())
    .maybeSingle();

  if (match) return match;

  const { data: fallback } = await supabase
    .from("jurisdictions")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();

  return fallback ?? null;
}

/**
 * Turns a jurisdiction's rules into the pass/fail lines shown on the listing.
 *
 * Everything here is a statement about the city's published code plus what
 * Yardtize enforces on top of it. It is deliberately conservative: where a rule
 * is unverified we say so rather than implying the placement is cleared.
 */
export function evaluateCompliance(
  jurisdiction: Jurisdiction,
  options: { signSizeSqft?: number; cornerLot?: boolean } = {},
): ComplianceReport {
  const rules = jurisdiction.rules as JurisdictionRules;
  const verified = jurisdiction.is_verified;

  // Yardtize never offers a sign larger than the city allows.
  const maxOfferedSqft = rules.max_sign_sqft;
  const allowedSizes = SIGN_SIZES.filter((s) => s.sqft <= maxOfferedSqft);
  const size = options.signSizeSqft ?? allowedSizes[0]?.sqft ?? SIGN_SIZES[0].sqft;

  const checks: ComplianceCheck[] = [];

  if (verified) {
    checks.push({
      status: size <= rules.max_sign_sqft ? "pass" : "warn",
      label:
        size <= rules.max_sign_sqft
          ? `${size} sq ft sign — within the city's ${rules.max_sign_sqft} sq ft limit`
          : `${size} sq ft exceeds the city's ${rules.max_sign_sqft} sq ft limit`,
    });

    checks.push({
      status: "pass",
      label:
        rules.permit_required_above_sqft && size < rules.permit_required_above_sqft
          ? `Under ${rules.max_height_ft} ft tall · no permit needed below ${rules.permit_required_above_sqft} sq ft`
          : `Under ${rules.max_height_ft} ft tall`,
    });
  } else {
    checks.push({
      status: "warn",
      label: "We haven't verified this city's sign code yet — conservative limits apply",
    });
  }

  // The one rule that is ours, not the city's, and applies everywhere.
  checks.push({
    status: "pass",
    label: "One sign per yard — a Yardtize rule, everywhere",
  });

  if (rules.setback_ft) {
    checks.push({
      status: "info",
      label: options.cornerLot && rules.corner_diagonal_ft
        ? `Keep the sign ${rules.setback_ft} ft inside your property line, and behind the ${rules.corner_diagonal_ft} ft corner sight triangle — we verify at install`
        : `Keep the sign ${rules.setback_ft} ft inside your property line — we verify at install`,
    });
  }

  if (rules.display_period_days) {
    checks.push({
      status: "info",
      label: rules.gap_days
        ? `${rules.display_period_days}-day display periods, then a ${rules.gap_days}-day gap — scheduling handles this`
        : `Display periods run up to ${rules.display_period_days} days`,
    });
  }

  if (verified && !rules.commercial_offpremise_allowed) {
    checks.push({
      status: "info",
      label: rules.weekend_corner?.allowed && options.cornerLot
        ? "Off-site commercial ads are restricted here — corner lots can host them on weekends, and nonprofits and campaigns are unrestricted"
        : rules.nonprofit_exempt
          ? "Off-site commercial ads are restricted here — campaigns and nonprofits are unrestricted"
          : "Off-site commercial ads are restricted here — campaign and noncommercial messages are unrestricted",
    });
  }

  if (verified && rules.political.allowed_year_round) {
    checks.push({
      status: "pass",
      label: rules.political.statute
        ? `Political signs protected year-round (${rules.political.statute})`
        : "Political signs allowed year-round within the size rules",
    });
  }

  return {
    jurisdiction,
    verified,
    checks,
    maxOfferedSqft,
    allowedSizes: allowedSizes.length ? allowedSizes : [SIGN_SIZES[0]],
    citations: jurisdiction.citations ?? [],
  };
}

export type AdvertiserFit = {
  allowed: boolean;
  /** Set when this jurisdiction only permits the message under a named product. */
  product?: string;
  reason: string;
};

/**
 * Whether a given advertiser may legally place a sign on this listing.
 *
 * This is the rule that makes the marketplace defensible rather than naive.
 * Both pilot cities prohibit off-site *commercial* signage, and the Supreme
 * Court upheld exactly that kind of ban in City of Austin v. Reagan (2022), so
 * we cannot sell a for-profit ad into a residential yard and hope. What the
 * codes turn on is the content-to-premises relationship, never who paid:
 *
 *  - Campaign and other noncommercial messages are fine in both cities.
 *  - Nonprofits fall outside Overland Park's definition entirely, which covers
 *    for-profit advertisers only.
 *  - For-profit businesses are blocked, except on an Overland Park corner lot,
 *    where § 18.440.130.G carves out a weekend sign that § 18.440.020.A
 *    explicitly exempts from the off-site prohibition.
 */
export function evaluateAdvertiserFit(
  jurisdiction: Jurisdiction,
  advertiserType: "business" | "campaign" | "nonprofit",
  cornerLot: boolean,
): AdvertiserFit {
  const rules = jurisdiction.rules as JurisdictionRules;
  const city = `${jurisdiction.name}, ${jurisdiction.state}`;

  if (!jurisdiction.is_verified) {
    return {
      allowed: false,
      reason: `We haven't verified ${city}'s sign code yet, so we don't offer paid placements here. Compliance review is pending.`,
    };
  }

  if (advertiserType === "campaign") {
    return {
      allowed: true,
      reason: rules.political.statute
        ? `Political signs are protected here (${rules.political.statute}) and are unrestricted during the election window.`
        : `${city} allows noncommercial and political messages year-round within the size rules.`,
    };
  }

  if (advertiserType === "nonprofit") {
    return rules.nonprofit_exempt
      ? {
          allowed: true,
          reason: `${city}'s off-site restriction covers for-profit advertisers only, so nonprofits are outside it entirely.`,
        }
      : {
          allowed: true,
          reason: `Noncommercial messages are permitted in ${city} within the size rules.`,
        };
  }

  // For-profit business from here down.
  if (rules.commercial_offpremise_allowed) {
    return { allowed: true, reason: `${city} permits off-site commercial signs.` };
  }

  if (rules.weekend_corner?.allowed && cornerLot) {
    return {
      allowed: true,
      product: "Weekend corner",
      reason: `${city} bans off-site commercial signs, except one extra sign on a corner lot from ${rules.weekend_corner.window}. This placement is offered on that basis only — up to ${rules.weekend_corner.max_sqft_per_face} sq ft per face and ${rules.weekend_corner.max_height_ft} ft tall.`,
    };
  }

  return {
    allowed: false,
    reason: `${city} prohibits off-site commercial signs in residential yards, so we can't offer a for-profit placement here. Campaign and nonprofit messages are unrestricted, and Overland Park corner lots can host commercial signs at weekends.`,
  };
}
