/**
 * Booking constants shared by the server action and the browser form.
 *
 * These live outside actions.ts deliberately: a "use server" module may only
 * export async functions, so exporting plain values from it breaks the build.
 *
 * Phase 1 takes no payment. These figures drive the estimate shown to an
 * advertiser so the commercial terms are clear before a homeowner is troubled.
 */

/** Sep 19 – Nov 5 2026 is 48 days ≈ 1.6 months of placement. */
export const ELECTION_WINDOW_MONTHS = 1.6;
export const SERVICE_FEE_RATE = 0.1;
export const SELF_INSTALL_DEPOSIT = 500;
export const PLATFORM_INSTALL_EACH_WAY = 99;
