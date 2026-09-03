"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { connectPayouts } from "./actions";
import { buttonClass, Card } from "@/components/ui";

/*
 * Stripe usually clears a new account within a minute of onboarding, but the
 * page it lands on is static — somebody who finishes, reads "still checking",
 * and simply waits would sit there indefinitely while the answer changed
 * behind them. So the pending state checks back on its own.
 *
 * Bounded, because verification can also take days and a page left open in a
 * tab should not poll Stripe until the laptop dies. After these attempts it
 * stops and offers the check as a button, which is the honest division: the
 * platform handles the case where waiting a moment is enough, and the person
 * decides what to do about the case where it is not.
 */
const POLL_EVERY_MS = 6_000;
const POLL_ATTEMPTS = 20;

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
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const waiting = started && !enabled;
  const polling = waiting && attempts < POLL_ATTEMPTS;

  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => {
      setAttempts((n) => n + 1);
      // The server re-reads the capability from Stripe whenever an account is
      // connected but not yet active, so refreshing is all this needs to do.
      router.refresh();
    }, POLL_EVERY_MS);
    return () => clearTimeout(timer);
  }, [polling, attempts, router]);

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
            from you unless Stripe asks
            {polling
              ? " — this page is watching, and will update itself the moment they're done."
              : ". It can take a few days. We'll show it here as soon as it clears."}{" "}
            You can reopen the form if you left something half-finished.
          </>
        ) : (
          <>
            <b>Tell us where to send your money.</b> Stripe collects your bank
            details on its own pages and handles the verification — Yardtize
            never sees an account number. Takes a couple of minutes.
          </>
        )}
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <form action={connectPayouts}>
          <Go label={started ? "Back to Stripe" : "Set up payouts"} />
        </form>
        {waiting && !polling && (
          <button
            type="button"
            onClick={() => {
              setAttempts(0);
              router.refresh();
            }}
            className="text-[12.5px] text-ink-2 underline underline-offset-2"
          >
            Check again
          </button>
        )}
      </div>
      {error && <p className="text-[12.5px] text-amber mt-2">{error}</p>}
    </Card>
  );
}
