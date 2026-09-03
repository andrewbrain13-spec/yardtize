import { NextResponse } from "next/server";
import { lookupTraffic } from "@/lib/traffic";
import { suggestRate } from "@/lib/rate";
import { findJurisdiction } from "@/lib/compliance";
import { consumeLookup, PER_VISITOR_PER_DAY } from "@/lib/quota";

/**
 * What a yard is worth, for anyone who asks.
 *
 * The only endpoint on the platform that does real work for a caller with no
 * account, which is the point — a homeowner who has heard of Yardtize should
 * be able to type their address and see a number without signing up for
 * anything. It is also why it is the only endpoint with a quota.
 *
 * Deliberately read-only. It creates no listing, stores no address, and leaves
 * nothing behind but a counter — the shared traffic cache is the one write,
 * and it is keyed by rounded coordinates rather than by anything about the
 * person who asked.
 *
 * The address arrives already geocoded, from the browser. Not a shortcut: the
 * Maps key is restricted by HTTP referrer, which is the right way to hold a
 * key that ships to the page, and Google refuses referrer-restricted keys on
 * its server-side Geocoding API outright. The listing wizard already geocodes
 * in the browser for the same reason. Nothing here trusts the coordinates for
 * anything that matters — they select a public traffic count, and a caller who
 * lies about them only gets the count for somewhere else.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOO_MANY = (message: string) =>
  NextResponse.json({ error: message }, { status: 429 });

export async function POST(request: Request) {
  let body: {
    lat?: number;
    lng?: number;
    city?: string;
    state?: string;
    formatted?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send an address." }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const city = String(body.city ?? "").trim().slice(0, 80);
  const state = String(body.state ?? "").trim().slice(0, 2).toUpperCase();
  const formatted = String(body.formatted ?? "").trim().slice(0, 200);

  // Continental bounds plus Alaska and Hawaii — a point outside them is a
  // malformed request, not an address we cannot price.
  const inUS = lat >= 18 && lat <= 72 && lng >= -180 && lng <= -66;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inUS || !state) {
    return NextResponse.json(
      { error: "That address didn't resolve to a US location." },
      { status: 400 },
    );
  }

  /*
   * Count the request before doing any of the expensive work, so a refused
   * caller costs a database round trip rather than three government queries.
   */
  const quota = await consumeLookup(request);
  if (!quota.allowed) {
    if (quota.reason === "visitor") {
      return TOO_MANY(
        `That's ${PER_VISITOR_PER_DAY} addresses today — the daily limit for checking without an account. Make one and there's no limit.`,
      );
    }
    if (quota.reason === "global") {
      return TOO_MANY(
        "Yardtize is looking up more addresses than usual right now. Try again in a little while.",
      );
    }
    return NextResponse.json(
      { error: "Address lookup isn't available right now." },
      { status: 503 },
    );
  }

  const traffic = await lookupTraffic({ lat, lng }, state);

  /*
   * No traffic, no estimate. Guessing a rate from nothing would be the one
   * thing this page must never do — the whole argument is that the number
   * comes from a published count, so when there is no count there is no
   * number.
   */
  if (!traffic.aadtSum) {
    return NextResponse.json({
      address: { formatted, city, state, lat, lng },
      traffic: null,
      rate: null,
      note:
        traffic.note ??
        "No agency publishes a traffic count for the roads at this address.",
      remaining: quota.remaining,
    });
  }

  /*
   * The neutral case: no signalised-corner or corner-lot multiplier, because
   * nobody has looked at the property. A homeowner listing it properly can
   * claim those and see the figure rise, which is the honest direction for an
   * estimate to move.
   */
  const rate = suggestRate({ aadtSum: traffic.aadtSum });

  const jurisdiction = await findJurisdiction(city, state);
  const covered = Boolean(jurisdiction && !jurisdiction.is_default);

  return NextResponse.json({
    address: { formatted, city, state, lat, lng },
    traffic: {
      aadtSum: traffic.aadtSum,
      source: traffic.source,
      year: traffic.year,
      segments: traffic.segments.map((s) => ({
        road: s.road,
        roadwayAadt: s.roadwayAadt,
        year: s.year,
      })),
    },
    rate: {
      monthly: rate.monthly,
      visibleImpressions: rate.visibleImpressions,
      clamped: rate.clamped,
    },
    compliance: {
      covered,
      // Named only when we have actually read that city's code.
      jurisdiction: covered ? `${jurisdiction!.name}, ${jurisdiction!.state}` : null,
      verified: Boolean(jurisdiction?.is_verified),
    },
    remaining: quota.remaining,
  });
}
