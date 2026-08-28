import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { runPayouts, describeRun, payoutsLive } from "@/lib/payouts";
import { formatCents } from "@/lib/billing";
import { paymentsEnabled, inTestMode } from "@/lib/stripe";
import { DEPOSIT_SETTLING_DAYS } from "@/lib/settlement";
import { DepositHold } from "./DepositHold";

export const metadata: Metadata = {
  title: "Settlement — Yardtize",
  robots: { index: false, follow: false },
};

/**
 * What the platform owes, and what stands in the way of paying it.
 *
 * This page always runs a dry run, whatever the deployment is set to — it is
 * a preview, and loading a page should never move money. The scheduled job is
 * the only thing that pays anybody, and it only does that once PAYOUTS_LIVE
 * is set.
 */
export const dynamic = "force-dynamic";

const TONE: Record<string, "brand" | "gold"> = {
  sent: "brand",
  refunded: "brand",
  "would send": "brand",
  "would refund": "brand",
  void: "gold",
  waiting: "gold",
  held: "gold",
  blocked: "gold",
  failed: "gold",
};

export default async function SettlementPage() {
  const { admin } = await requireAdmin("/admin/settlement");
  if (!admin) return null;

  const run = await runPayouts({ live: false });

  const owed = run.payouts.filter((p) => p.action === "would send");
  const blocked = run.payouts.filter((p) => p.action === "blocked");
  const otherPayouts = run.payouts.filter(
    (p) => p.action !== "would send" && p.action !== "blocked",
  );
  const refundable = run.deposits.filter((d) => d.action === "would refund");
  const otherDeposits = run.deposits.filter((d) => d.action !== "would refund");

  const owedCents = owed.reduce((sum, p) => sum + p.settledCents, 0);
  const blockedCents = blocked.reduce((sum, p) => sum + p.settledCents, 0);
  const refundCents = refundable.reduce((sum, d) => sum + d.amountCents, 0);

  return (
    <div className="max-w-[860px] mx-auto px-[26px] py-[52px]">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h1 className="text-[26px] tracking-[-0.4px]">Settlement</h1>
        <Badge tone={payoutsLive() ? "brand" : "gold"}>
          {payoutsLive() ? "paying" : "dry run"}
        </Badge>
        {inTestMode() && <Badge tone="gold">Stripe test mode</Badge>}
      </div>
      <p className="text-ink-2 mb-5 max-w-[62ch]">
        Homeowners are settled monthly in arrears, for the days their sign
        actually stood. Deposits go back {DEPOSIT_SETTLING_DAYS} days after a
        sign comes down, unless you hold one. This page is always a preview —
        opening it never moves money.
      </p>

      {!paymentsEnabled() && (
        <Card className="p-4 mb-4 border-amber-edge bg-amber-wash">
          <p className="text-[13px]">
            <b>No Stripe key on this deployment.</b> The figures below are the
            arithmetic only; nothing can be sent until a key is set.
          </p>
        </Card>
      )}

      {paymentsEnabled() && !payoutsLive() && (
        <Card className="p-4 mb-4 border-amber-edge bg-amber-wash">
          <p className="text-[13px]">
            <b>Payouts are not switched on.</b> The daily job is running these
            same checks and sending nothing. When the figures here look right,
            add <code className="font-mono text-[12px]">PAYOUTS_LIVE</code> with
            the value <code className="font-mono text-[12px]">1</code> in Vercel
            and redeploy. Until then this is the only thing standing between the
            calculation and somebody&rsquo;s bank account, which is where it
            should be while nobody has watched a transfer succeed.
          </p>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Card className="p-[18px]">
          <div className="text-[11.5px] text-ink-3 font-medium">Ready to pay out</div>
          <div className="text-[21px] font-bold tracking-[-0.4px] mt-0.5 tabular-nums">
            {formatCents(owedCents)}
          </div>
          <div className="text-[11.5px] text-ink-2">
            {owed.length} period{owed.length === 1 ? "" : "s"} settled
          </div>
        </Card>
        <Card className="p-[18px]">
          <div className="text-[11.5px] text-ink-3 font-medium">Owed but stuck</div>
          <div className="text-[21px] font-bold tracking-[-0.4px] mt-0.5 tabular-nums">
            {formatCents(blockedCents)}
          </div>
          <div className="text-[11.5px] text-ink-2">
            {blocked.length === 0 ? "nobody is waiting" : "homeowner can't receive it"}
          </div>
        </Card>
        <Card className="p-[18px]">
          <div className="text-[11.5px] text-ink-3 font-medium">Deposits going back</div>
          <div className="text-[21px] font-bold tracking-[-0.4px] mt-0.5 tabular-nums">
            {formatCents(refundCents)}
          </div>
          <div className="text-[11.5px] text-ink-2">
            {refundable.length} due for return
          </div>
        </Card>
      </div>

      {blocked.length > 0 && (
        <Card className="p-[22px] mb-4 border-amber-edge">
          <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-1">
            Needs someone to act
          </h2>
          <p className="text-[13px] text-ink-2 mb-2.5 max-w-[58ch]">
            These homeowners have earned money the platform cannot send. Each
            one needs them to finish connecting an account — worth a nudge
            rather than a wait.
          </p>
          {blocked.map((p) => (
            <Row key={p.payoutId} {...p} />
          ))}
        </Card>
      )}

      <Card className="p-[22px] mb-4">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
          Homeowner payouts
        </h2>
        {run.payouts.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">
            Nothing has reached the end of a billing period yet.
          </p>
        ) : (
          [...owed, ...otherPayouts].map((p) => <Row key={p.payoutId} {...p} />)
        )}
      </Card>

      <Card className="p-[22px]">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
          Deposits
        </h2>
        {run.deposits.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">No deposits have been paid yet.</p>
        ) : (
          [...refundable, ...otherDeposits].map((d) => (
            <div
              key={d.chargeId}
              className="flex justify-between items-baseline gap-3 flex-wrap py-2.5 border-t border-hairline first:border-t-0"
            >
              <span className="min-w-0">
                <Link
                  href={`/placements/${d.requestId}`}
                  className="text-[14px] font-semibold text-brand-deep underline underline-offset-2"
                >
                  {d.yard}
                </Link>
                <span className="block text-[12px] text-ink-2">{d.detail}</span>
              </span>
              <span className="text-right shrink-0">
                <b className="block text-[14px] tabular-nums">{formatCents(d.amountCents)}</b>
                <Badge tone={TONE[d.action] ?? "gold"}>{d.action}</Badge>
                {d.action !== "refunded" && (
                  <DepositHold requestId={d.requestId} held={d.heldReason} />
                )}
              </span>
            </div>
          ))
        )}
      </Card>

      <p className="text-[12.5px] text-ink-3 mt-4">{describeRun(run)}</p>
      <p className="text-[12.5px] text-ink-3 mt-1">
        <Link href="/admin" className="text-brand">
          ← back to operations
        </Link>
      </p>
    </div>
  );
}

function Row(p: {
  payoutId: string;
  requestId: string;
  yard: string;
  period: string;
  scheduledCents: number;
  settledCents: number;
  action: string;
  detail: string;
}) {
  const prorated = p.settledCents > 0 && p.settledCents < p.scheduledCents;
  return (
    <div className="flex justify-between items-baseline gap-3 flex-wrap py-2.5 border-t border-hairline first:border-t-0">
      <span className="min-w-0">
        <Link
          href={`/placements/${p.requestId}`}
          className="text-[14px] font-semibold text-brand-deep underline underline-offset-2"
        >
          {p.yard}
        </Link>
        <span className="block text-[12px] text-ink-2">
          {p.period} · {p.detail}
        </span>
      </span>
      <span className="text-right shrink-0">
        <b className="block text-[14px] tabular-nums">
          {formatCents(p.settledCents || p.scheduledCents)}
        </b>
        {prorated && (
          <span className="block text-[11.5px] text-ink-3 tabular-nums">
            of {formatCents(p.scheduledCents)}
          </span>
        )}
        <Badge tone={TONE[p.action] ?? "gold"}>{p.action}</Badge>
      </span>
    </div>
  );
}
