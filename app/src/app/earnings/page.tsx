import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/supabase/server";
import { earningsFor } from "@/lib/earnings";
import { formatCents } from "@/lib/billing";
import { describeTerm } from "@/lib/scheduling";
import { paymentsEnabled, inTestMode } from "@/lib/stripe";
import { refreshPayoutStatus } from "@/lib/payments";
import { PayoutSetup } from "./PayoutSetup";

export const metadata: Metadata = {
  title: "Your earnings — Yardtize",
  robots: { index: false, follow: false },
};

/**
 * What the yard has made.
 *
 * Earnings accrue by the day a sign actually stands, so this never tells a
 * homeowner they are owed money they have not yet earned. It also says plainly
 * that payouts are not running yet — a screen full of figures with no money
 * behind them would be worse than no screen at all if it did not admit that.
 */
export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const session = await getSessionProfile();
  if (!session?.user) redirect("/sign-in?next=/earnings");
  if (!session.profile?.role) redirect("/welcome?next=/earnings");

  /*
   * Back from Stripe's onboarding. Ask Stripe rather than assume: finishing
   * the form and being cleared for payouts are different events, sometimes
   * days apart, and only Stripe knows which one has happened.
   */
  const { connect } = await searchParams;
  const returned = connect === "done" || connect === "retry";
  const payoutsReady = returned
    ? await refreshPayoutStatus(session.user.id)
    : Boolean(session.profile?.payouts_enabled);

  const connectError =
    connect === "not-configured"
      ? "Payouts aren't switched on for this deployment yet."
      : connect === "failed"
        ? "Stripe didn't answer. Try again in a moment."
        : undefined;

  const earnings = await earningsFor(session.user.id);

  if (!earnings) {
    return (
      <div className="max-w-[720px] mx-auto px-[26px] py-[70px]">
        <Card className="p-[32px]">
          <h1 className="text-[22px]">Your earnings</h1>
          <p className="text-ink-2 mt-2.5">
            This screen can&rsquo;t reach the database right now. Try again in a
            moment.
          </p>
        </Card>
      </div>
    );
  }

  const {
    lines,
    earnedToDateCents,
    bookedAheadCents,
    monthlyRunRateCents,
    paidOutCents,
    awaitingPayoutCents,
  } = earnings;

  return (
    <div className="max-w-[820px] mx-auto px-[26px] py-[52px]">
      <h1 className="text-[26px] tracking-[-0.4px]">Your earnings</h1>
      <p className="text-ink-2 mt-1.5 mb-6 max-w-[58ch]">
        What your yards have earned so far, and what is already agreed. Earnings
        build up day by day while a sign stands.
      </p>

      {lines.length === 0 ? (
        <Card className="p-[42px] text-center">
          <h2 className="text-[19px]">Nothing earned yet</h2>
          <p className="text-ink-2 mt-2.5 mb-5 max-w-[46ch] mx-auto">
            Once you approve an advertiser, what they pay shows up here and
            builds each day the sign is up.
          </p>
          <ButtonLink href="/list">List a yard →</ButtonLink>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Figure
              label="Earned so far"
              value={formatCents(earnedToDateCents)}
              sub={
                paymentsEnabled() && paidOutCents > 0
                  ? `${formatCents(paidOutCents)} paid, ${formatCents(awaitingPayoutCents)} on the way`
                  : "accrued day by day"
              }
              big
            />
            <Figure label="Still to come" value={formatCents(bookedAheadCents)} sub="on placements already agreed" />
            <Figure
              label="Monthly run-rate"
              value={formatCents(monthlyRunRateCents)}
              sub={monthlyRunRateCents > 0 ? "across live placements" : "nothing live right now"}
            />
          </div>

          {paymentsEnabled() ? (
            <PayoutSetup
              started={Boolean(session.profile?.stripe_account_id)}
              enabled={payoutsReady}
              testMode={inTestMode()}
              error={connectError}
            />
          ) : (
            <Card className="p-4 mt-3 border-amber-edge bg-amber-wash">
              <p className="text-[13px]">
                <b>Payouts aren&rsquo;t running yet.</b> These are what
                you&rsquo;ve earned under your agreements — the money moves once
                Yardtize finishes connecting payments. Until then advertisers
                settle with you directly.
              </p>
            </Card>
          )}

          <Card className="p-[22px] mt-4">
            <h2 className="text-[17px] tracking-[-0.3px] mb-2">Placement by placement</h2>
            {lines.map((line) => (
              <div key={line.requestId} className="py-3.5 border-t border-hairline first:border-t-0">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="min-w-0">
                    <b className="block text-[14.5px]">{line.yard}</b>
                    <span className="text-[12.5px] text-ink-2">
                      {line.advertiser} ·{" "}
                      {describeTerm({ startsOn: line.startsOn, endsOn: line.endsOn })}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <b className="block text-[16px] tabular-nums">{formatCents(line.earnedCents)}</b>
                    <span className="text-[11.5px] text-ink-3">
                      {line.finished
                        ? "final"
                        : `of ${formatCents(line.termTotalCents)}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap mt-2">
                  <Badge tone={line.status === "active" ? "brand" : "gold"}>{line.status}</Badge>
                  <span className="text-[12px] text-ink-3 tabular-nums">
                    {line.finished
                      ? `ran ${line.daysElapsed} of ${line.daysTotal} days`
                      : `day ${line.daysElapsed} of ${line.daysTotal}`}
                  </span>
                  <Link
                    href={`/placements/${line.requestId}`}
                    className="text-[12.5px] font-semibold text-brand-deep underline underline-offset-2"
                  >
                    the placement →
                  </Link>
                </div>

                <div className="h-1.5 rounded-full bg-brand-wash-2 mt-2.5 overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full"
                    style={{ width: `${Math.round((line.daysElapsed / line.daysTotal) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  big,
}: {
  label: string;
  value: string;
  sub: string;
  big?: boolean;
}) {
  return (
    <Card className="p-[18px]">
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div
        className={`${big ? "text-[27px]" : "text-[21px]"} font-bold tracking-[-0.5px] mt-0.5 tabular-nums`}
      >
        {value}
      </div>
      <div className="text-[11.5px] text-ink-2">{sub}</div>
    </Card>
  );
}
