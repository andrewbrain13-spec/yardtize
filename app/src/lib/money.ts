/**
 * Whole-dollar formatting with a thousands separator.
 *
 * Rates were double digits when the app was first written, so several screens
 * interpolated them raw. Once the pricing model started producing four-figure
 * monthly rates that rendered as "$5745".
 */
export function money(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return "$" + Math.round(amount).toLocaleString("en-US");
}
