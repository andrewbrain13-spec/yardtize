import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupTraffic } from "@/lib/traffic";
import { suggestRate } from "@/lib/rate";

/**
 * Traffic counts + suggested rate for a dragged sign pin.
 *
 * Signed-in only: this fans out to state DOT servers and writes the shared
 * AADT cache, neither of which should be open to anonymous callers.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  let payload: { lat?: number; lng?: number; state?: string; signalized?: boolean; cornerLot?: boolean };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { lat, lng, state } = payload;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return NextResponse.json({ error: "A valid map location is required." }, { status: 400 });
  }

  try {
    const traffic = await lookupTraffic({ lat, lng }, state ?? "MO");

    const rate =
      traffic.aadtSum === null
        ? null
        : suggestRate({
            aadtSum: traffic.aadtSum,
            signalized: Boolean(payload.signalized),
            cornerLot: Boolean(payload.cornerLot),
          });

    return NextResponse.json({ traffic, rate });
  } catch (error) {
    // Never invent a number when the state server is unreachable — say so.
    return NextResponse.json(
      {
        error:
          "The state traffic service didn't respond. Your listing can still be saved; we'll fill the counts in when it's back.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
