"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { payCharge } from "./actions";
import { buttonClass } from "@/components/ui";
import type { LifecycleState } from "./actions";

const INITIAL: LifecycleState = { status: "idle" };

function Go({ amount }: { amount: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary")} disabled:opacity-60 text-[13px] py-1.5 px-3`}
    >
      {pending ? "Opening Stripe…" : `Pay ${amount}`}
    </button>
  );
}

/**
 * Pay one charge.
 *
 * Deliberately per-charge rather than one button for everything outstanding.
 * Billing is monthly in advance, so "everything outstanding" on a twelve-month
 * placement would be a five-figure button — and the whole reason the schedule
 * is monthly is that nobody wants to see that number at signing.
 */
export function PayButton({ chargeId, amount }: { chargeId: string; amount: string }) {
  const [state, action] = useActionState(payCharge, INITIAL);

  return (
    <form action={action} className="mt-1.5">
      <input type="hidden" name="chargeId" value={chargeId} />
      <Go amount={amount} />
      {state.status === "error" && (
        <p className="text-[12px] text-amber mt-1.5 max-w-[30ch]">{state.message}</p>
      )}
    </form>
  );
}
