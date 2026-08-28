"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setDepositHold, type LifecycleState } from "@/app/placements/[id]/actions";
import { buttonClass } from "@/components/ui";

const INITIAL: LifecycleState = { status: "idle" };

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("ghost")} disabled:opacity-60 text-[12.5px] py-1 px-2.5`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/**
 * Stop a deposit going back, or let it go.
 *
 * Collapsed by default. Holding somebody's deposit should take a decision and
 * a sentence, not a stray click on a row an operator was only reading.
 */
export function DepositHold({
  requestId,
  held,
}: {
  requestId: string;
  held: string | null;
}) {
  const [state, action] = useActionState(setDepositHold, INITIAL);
  const [open, setOpen] = useState(false);

  if (held && !open) {
    return (
      <form action={action} className="mt-1.5 flex gap-2 items-center flex-wrap">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="reason" value="" />
        <Go label="Release the hold" />
      </form>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-[12px] text-ink-3 underline underline-offset-2"
      >
        Hold this deposit
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-col gap-1.5 items-end">
      <input type="hidden" name="requestId" value={requestId} />
      <input
        name="reason"
        required
        maxLength={300}
        autoFocus
        placeholder="Why — both parties see this"
        className="w-[260px] max-w-full text-[12.5px] px-2.5 py-1.5 rounded-lg border border-edge bg-surface"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-ink-3 underline underline-offset-2"
        >
          Cancel
        </button>
        <Go label="Hold it" />
      </div>
      {state.status === "error" && (
        <p className="text-[12px] text-amber">{state.message}</p>
      )}
    </form>
  );
}
