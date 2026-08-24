/**
 * The wording somebody agrees to when they sign.
 *
 * Versioned and stored on each signature rather than referenced, so a change
 * here never rewrites what an earlier signer actually saw.
 */
export const CONSENT_VERSION = "2026-08-1";

export const CONSENT_TEXT =
  "By typing my name and choosing to sign, I am signing this agreement electronically. " +
  "I intend my typed name to be my signature, I agree to do business electronically, " +
  "and I have read the agreement above. I understand Yardtize records the time, my " +
  "network address and my browser alongside this signature.";

/** Both sides must sign before anything goes to review. */
export const PARTIES = ["owner", "advertiser"] as const;
export type Party = (typeof PARTIES)[number];

export const partyLabel: Record<Party, string> = {
  owner: "Property owner",
  advertiser: "Advertiser",
};
