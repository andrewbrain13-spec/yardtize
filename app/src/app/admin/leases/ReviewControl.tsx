"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { reviewLease, type ReviewState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: ReviewState = { status: "idle" };

function Go({ label, busy, tone }: { label: string; busy: string; tone: "brand" | "amber" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${tone === "brand" ? buttonClass() : "text-[13px] font-semibold text-amber underline underline-offset-2"} disabled:opacity-50`}
    >
      {pending ? busy : label}
    </button>
  );
}

/** Confirm the signatures, or send it back saying what was wrong. */
export function ReviewControl({ leaseId }: { leaseId: string }) {
  const [result, action] = useActionState(reviewLease, INITIAL);
  const [rejecting, setRejecting] = useState(false);

  if (result.status === "done") {
    return <p className="text-[13px] text-good-text">✓ Recorded. Both parties have been told.</p>;
  }

  if (rejecting) {
    return (
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="leaseId" value={leaseId} />
        <input type="hidden" name="approve" value="false" />
        <textarea
          name="note"
          required
          rows={2}
          placeholder="What's wrong? e.g. only one signature, or the dates don't match."
          className="w-full border-[1.5px] border-hairline bg-white rounded-[10px] px-3 py-2 text-[13px] focus:outline-none focus:border-brand-mid"
        />
        <div className="flex items-center gap-3">
          <Go label="Send it back" busy="Sending…" tone="amber" />
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="text-[13px] text-ink-3 underline underline-offset-2"
          >
            cancel
          </button>
        </div>
        {result.status === "error" && (
          <p role="alert" className="text-[12.5px] text-amber">
            {result.message}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <form action={action}>
        <input type="hidden" name="leaseId" value={leaseId} />
        <input type="hidden" name="approve" value="true" />
        <Go label="Confirm — take it live" busy="Confirming…" tone="brand" />
      </form>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="text-[13px] font-semibold text-ink-3 underline underline-offset-2"
      >
        Something&rsquo;s wrong
      </button>
      {result.status === "error" && (
        <span role="alert" className="text-[12.5px] text-amber">
          {result.message}
        </span>
      )}
    </div>
  );
}
