import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Daily heartbeat that keeps the Supabase project out of its free-tier
 * auto-pause. Supabase pauses a project after 7 days with no activity, which
 * would take sign-in and listings offline until someone unpauses it by hand —
 * a bad surprise five minutes before a demo. One cheap read per day is enough
 * to count as activity.
 *
 * Triggered by the Vercel cron entry in vercel.json.
 */
export async function GET(request: NextRequest) {
  // Vercel signs cron invocations when CRON_SECRET is set. When it is not,
  // this endpoint is harmless anyway: it only counts public reference rows.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("jurisdictions")
      .select("id", { count: "exact", head: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      jurisdictions: count,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
