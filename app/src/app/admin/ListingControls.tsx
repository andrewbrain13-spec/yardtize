"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setListingStatus, deleteListing, type ModState } from "./actions";

const INITIAL: ModState = { status: "idle" };

const linkish =
  "text-[12.5px] font-semibold underline underline-offset-2 disabled:opacity-50";

function Pending({ label, busy, tone = "brand" }: { label: string; busy: string; tone?: "brand" | "amber" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${linkish} ${tone === "amber" ? "text-amber" : "text-brand-deep"}`}
    >
      {pending ? busy : label}
    </button>
  );
}

/**
 * Pause, restore, remove — the operator's half of the 48-hour takedown
 * promise. Pause is offered first and reads as the ordinary action, because a
 * complaint that turns out to be mistaken should be undoable.
 */
export function ListingControls({
  listingId,
  status,
  isDemo,
}: {
  listingId: string;
  status: string;
  isDemo: boolean;
}) {
  const [statusResult, statusAction] = useActionState(setListingStatus, INITIAL);
  const [deleteResult, deleteAction] = useActionState(deleteListing, INITIAL);
  const [confirming, setConfirming] = useState(false);

  const live = status === "live";

  return (
    <span className="flex items-center gap-3 flex-wrap justify-end">
      <form action={statusAction}>
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="status" value={live ? "paused" : "live"} />
        <Pending
          label={live ? "Take down" : "Put back"}
          busy={live ? "Taking down…" : "Restoring…"}
          tone={live ? "amber" : "brand"}
        />
      </form>

      {confirming ? (
        <form action={deleteAction} className="flex items-center gap-2">
          <input type="hidden" name="listingId" value={listingId} />
          <span className="text-[12px] text-ink-2">
            {isDemo ? "Delete this demo yard?" : "Delete permanently?"}
          </span>
          <Pending label="Yes, delete" busy="Deleting…" tone="amber" />
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-[12.5px] text-ink-3 underline underline-offset-2"
          >
            no
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`${linkish} text-ink-3`}
        >
          Delete
        </button>
      )}

      {(statusResult.status === "error" || deleteResult.status === "error") && (
        <span role="alert" className="text-[12px] text-amber">
          {statusResult.message ?? deleteResult.message}
        </span>
      )}
    </span>
  );
}
