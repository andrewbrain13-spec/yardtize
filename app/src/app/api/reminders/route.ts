import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPlacementReminder } from "@/lib/notifications";
import { addDays, today } from "@/lib/scheduling";

/**
 * The daily nudge. Called by Vercel Cron.
 *
 * Three things nobody should have to remember:
 *   · a placement starting tomorrow that nobody has confirmed installed
 *   · a term ending in a week
 *   · a term that has ended with the sign still recorded as standing
 *
 * Each send is written to placement_reminders first, and a unique index on
 * (request_id, kind) is what stops a second run mailing the same person twice.
 * That ordering matters: recording after sending would double-mail whenever
 * the write failed, and this job runs unattended.
 */
export async function GET(request: NextRequest) {
  /*
   * Vercel signs cron invocations with CRON_SECRET when it is set. Without
   * that, anyone could hit this URL and make the platform mail its users.
   */
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const now = today();
  const sent: string[] = [];

  const { data: placements } = await admin
    .from("requests")
    .select("id, starts_on, ends_on, installed_at, removed_at, status")
    .in("status", ["approved", "active"]);

  for (const placement of placements ?? []) {
    const due: string[] = [];

    // Going up tomorrow, and nobody has said it is up.
    if (!placement.installed_at && placement.starts_on <= addDays(now, 1)) {
      due.push("install-due");
    }

    // A week left.
    if (placement.status === "active" && !placement.removed_at && placement.ends_on === addDays(now, 7)) {
      due.push("ending-soon");
    }

    // Past the end date and still standing.
    if (!placement.removed_at && placement.ends_on <= now) {
      due.push("removal-due");
    }

    for (const kind of due) {
      const { error } = await admin
        .from("placement_reminders")
        .insert({ request_id: placement.id, kind });

      // 23505 means a previous run already sent this one.
      if (error) continue;

      await notifyPlacementReminder(
        placement.id,
        kind as "install-due" | "ending-soon" | "removal-due",
        "https://www.yardtize.com",
      );
      sent.push(`${placement.id.slice(0, 8)}:${kind}`);
    }
  }

  return NextResponse.json({ checked: placements?.length ?? 0, sent });
}
