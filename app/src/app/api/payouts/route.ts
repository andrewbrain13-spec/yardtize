import { NextResponse, type NextRequest } from "next/server";
import { runPayouts, describeRun, payoutsLive } from "@/lib/payouts";

/**
 * The daily settlement run, called by Vercel Cron.
 *
 * Closed behind CRON_SECRET like the reminder job, and for a stronger reason:
 * this one moves money. A missing secret leaves it open, so unlike the
 * reminder endpoint this refuses outright rather than running unauthenticated
 * — an endpoint that pays people should not be reachable by accident.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; refusing to run a settlement unauthenticated" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }

  const run = await runPayouts();

  return NextResponse.json({
    summary: describeRun(run),
    hint: payoutsLive()
      ? undefined
      : "Dry run. Set PAYOUTS_LIVE=1 once the figures below look right.",
    ...run,
  });
}
