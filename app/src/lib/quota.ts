import "server-only";

/**
 * How much free work an anonymous visitor may ask Yardtize to do.
 *
 * The public estimate page makes Yardtize query state DOT servers on a
 * stranger's behalf. Those servers are free, slow, and not ours — being the
 * origin of a flood aimed at MoDOT is a phone call nobody wants. Two limits,
 * because they fail differently:
 *
 *   · per visitor, which stops one person scripting it
 *   · across everybody, which bounds the worst case a per-visitor count
 *     cannot see — a hundred addresses each asking ten times is invisible to
 *     the first limit and very visible to MoDOT
 *
 * Neither limit is a security boundary. An IP is trivially changed, and it is
 * not meant to stop a determined attacker; it is meant to keep casual abuse
 * and a runaway script from costing somebody else their afternoon.
 */

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { today } from "@/lib/scheduling";

/** Generous enough that nobody checking their own street ever notices. */
export const PER_VISITOR_PER_DAY = 12;

/** The ceiling across everybody, well under what a state server would notice. */
export const GLOBAL_PER_DAY = 2_000;

export type QuotaVerdict =
  | { allowed: true; used: number; remaining: number }
  | { allowed: false; reason: "visitor" | "global" | "unavailable" };

/**
 * The visitor's identity for counting purposes.
 *
 * A salted hash, never the address itself. We need to know two requests came
 * from the same place, not where that place is — an IP is personal data, and
 * storing one to enforce a soft limit would be collecting something we have no
 * business holding.
 *
 * The salt defaults to a constant when unset. That is deliberate: a missing
 * environment variable should degrade the anonymity of the hash, not disable
 * the limiter and leave the endpoint wide open.
 */
export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const salt = process.env.QUOTA_SALT ?? "yardtize-public-estimate";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function consumeLookup(request: Request): Promise<QuotaVerdict> {
  const admin = createAdminClient();
  if (!admin) return { allowed: false, reason: "unavailable" };

  const day = today();

  /*
   * Global ceiling first. Checking it before incrementing means a flood does
   * not also fill the quota table on its way to being refused.
   */
  const { data: total } = await admin.rpc("lookups_today", { p_day: day });
  if (typeof total === "number" && total >= GLOBAL_PER_DAY) {
    return { allowed: false, reason: "global" };
  }

  const { data, error } = await admin.rpc("bump_lookup_quota", {
    p_visitor: visitorKey(request),
    p_day: day,
    p_limit: PER_VISITOR_PER_DAY,
  });

  if (error) return { allowed: false, reason: "unavailable" };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) return { allowed: false, reason: "visitor" };

  return {
    allowed: true,
    used: row.used,
    remaining: Math.max(0, PER_VISITOR_PER_DAY - row.used),
  };
}
