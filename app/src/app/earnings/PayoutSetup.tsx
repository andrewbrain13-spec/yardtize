"use client";

import { useFormStatus } from "react-dom";
import { connectPayouts } from "./actions";
import { buttonClass, Card } from "@/components/ui";

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary")} disabled:opacity-60`}
    >
      {pending ? "Opening Stripe…" : label}
    </button>
  );
}

/**
 * Where a homeowner's money lands.
 *
 * Three states worth distinguishing, because they need different things from
 * the person reading: never started, started but not cleared by Stripe, and
 * done. The middle one is the easy one to get wrong — somebody who filled in
 * every screen and is waiting on verification has not failed at anything, and
 * a call to action would suggest they had.
 */
export function PayoutSetup({
  started,
  enabled,
  testMode,
  error,
}: {
  started: boolean;
  enabled: boolean;
  testMode: boolean;
  error?: string;
}) {
  if (enabled) {
    return (
      <Card className="p-4 mt-3">
        <p className="text-[13px]">
          <b>Payouts are connected.</b> Money reaches your bank a few days after
          each advertiser payment clears.
          {testMode && " This deployment is in Stripe test mode — no real money moves yet."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 mt-3 border-amber-edge bg-amber-wash">
      <p className="text-[13px] mb-3">
        {started ? (
          <>
            <b>Stripe is still checking your details.</b> Nothing more is needed
            from you unless Stripe asks. You can reopen the form if you left
            something half-finished.
          </>
        ) : (
          <>
            <b>Tell us where to send your money.</b> Stripe collects your bank
            details on its own pages and handles the verification — Yardtize
            never sees an account number. Takes a couple of minutes.
          </>
        )}
      </p>
      <form action={connectPayouts}>
        <Go label={started ? "Back to Stripe" : "Set up payouts"} />
      </form>
      {error && <p className="text-[12.5px] text-amber mt-2">{error}</p>}
    </Card>
  );
}
