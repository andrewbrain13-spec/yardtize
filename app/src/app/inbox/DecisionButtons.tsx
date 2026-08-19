"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";
import { decideRequest, type DecisionState } from "./actions";
import type { RequestStatus } from "@/lib/supabase/types";

function Button({
  label,
  variant,
}: {
  label: string;
  variant: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass(variant)} disabled:opacity-60`}>
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Approve / decline / mark-live controls for one request. */
export function DecisionButtons({
  requestId,
  status,
}: {
  requestId: string;
  status: RequestStatus;
}) {
  const [state, action] = useActionState<DecisionState, FormData>(decideRequest, {});

  const options: Array<{ next: RequestStatus; label: string; variant: "primary" | "ghost" }> =
    status === "requested"
      ? [
          { next: "approved", label: "Approve", variant: "primary" },
          { next: "declined", label: "Decline", variant: "ghost" },
        ]
      : status === "approved"
        ? [
            { next: "active", label: "Sign is up — mark live", variant: "primary" },
            { next: "declined", label: "Cancel", variant: "ghost" },
          ]
        : status === "active"
          ? [{ next: "completed", label: "Placement finished", variant: "ghost" }]
          : [];

  if (!options.length) return null;

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {options.map((o) => (
          <form key={o.next} action={action}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="next" value={o.next} />
            <Button label={o.label} variant={o.variant} />
          </form>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mt-2.5">
          {state.error}
        </p>
      )}
    </div>
  );
}
