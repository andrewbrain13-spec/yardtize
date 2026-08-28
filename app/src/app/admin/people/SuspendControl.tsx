"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setSuspended, type ModState } from "../actions";

const INITIAL: ModState = { status: "idle" };

function Go({ label, busy, tone }: { label: string; busy: string; tone: "amber" | "brand" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`text-[12.5px] font-semibold underline underline-offset-2 disabled:opacity-50 ${
        tone === "amber" ? "text-amber" : "text-brand-deep"
      }`}
    >
      {pending ? busy : label}
    </button>
  );
}

/**
 * Suspending asks for a reason before it will go through. Three months from
 * now the question will be "why is this person stopped?", and an operator
 * screen that cannot answer it is how someone stays stopped by accident.
 */
export function SuspendControl({
  profileId,
  suspended,
  reason,
}: {
  profileId: string;
  suspended: boolean;
  reason: string | null;
}) {
  const [result, action] = useActionState(setSuspended, INITIAL);
  const [open, setOpen] = useState(false);

  if (suspended) {
    return (
      <span className="flex items-center gap-2.5 flex-wrap justify-end">
        {reason && <span className="text-[12px] text-ink-3 max-w-[26ch] truncate">{reason}</span>}
        <form action={action}>
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="suspend" value="false" />
          <Go label="Reinstate" busy="Reinstating…" tone="brand" />
        </form>
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12.5px] font-semibold text-ink-3 underline underline-offset-2"
      >
        Suspend
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2 flex-wrap justify-end">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="suspend" value="true" />
      <input
        name="reason"
        required
        placeholder="Why? e.g. city notice, unresolved"
        aria-label="Reason for suspending"
        className="border-[1.5px] border-hairline bg-field rounded-[9px] px-2.5 py-1.5 text-[12.5px] w-[210px] focus:outline-none focus:border-brand-mid"
      />
      <Go label="Suspend" busy="Suspending…" tone="amber" />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[12.5px] text-ink-3 underline underline-offset-2"
      >
        cancel
      </button>
      {result.status === "error" && (
        <span role="alert" className="text-[12px] text-amber w-full text-right">
          {result.message}
        </span>
      )}
    </form>
  );
}
