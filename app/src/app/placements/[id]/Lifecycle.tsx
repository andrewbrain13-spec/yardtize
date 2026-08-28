"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { confirmInstalled, requestTakedown, confirmRemoved, type LifecycleState } from "./actions";
import { buttonClass, Card } from "@/components/ui";

const INITIAL: LifecycleState = { status: "idle" };

function Go({ label, busy, variant = "primary" }: { label: string; busy: string; variant?: "primary" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass(variant)} disabled:opacity-60`}>
      {pending ? busy : label}
    </button>
  );
}

/** Photo attach that shares the upload path with the signed-lease control. */
function PhotoField({
  userId,
  requestId,
  onUploaded,
  label,
}: {
  userId: string;
  requestId: string;
  onUploaded: (path: string | null) => void;
  label: string;
}) {
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    if (file.size > 15 * 1024 * 1024) {
      setError("That photo is over 15 MB — a smaller one will do.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${userId}/${requestId}-${Date.now()}.${extension}`;
      const timeout = new Promise<{ timedOut: true }>((resolve) =>
        setTimeout(() => resolve({ timedOut: true }), 60_000),
      );
      const outcome = await Promise.race([
        supabase.storage.from("placement-photos").upload(path, file, { upsert: true }),
        timeout,
      ]);
      if ("timedOut" in outcome) {
        setError("That's taking too long — check your connection and try again.");
      } else if (outcome.error) {
        setError("The upload didn't go through. Try again in a moment.");
      } else {
        setName(file.name);
        onUploaded(path);
      }
    } catch {
      setError("The upload didn't go through. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3">
      <label
        htmlFor={`photo-${requestId}`}
        className="block border-[1.5px] border-dashed border-edge rounded-[11px] px-4 py-3.5 text-center cursor-pointer hover:bg-brand-wash"
      >
        <span className="block text-[13.5px] font-semibold text-brand-deep">
          {busy ? "Uploading…" : name ? `✓ ${name}` : label}
        </span>
        <span className="block text-[12px] text-ink-2 mt-0.5">Optional, but it&rsquo;s the proof</span>
        <input
          id={`photo-${requestId}`}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pick(file);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-[12.5px] text-amber mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * What can be done to a live placement, and by whom.
 *
 * Only ever one primary action showing. A placement is somewhere specific in
 * its life — not yet up, up, coming down, done — and offering every verb at
 * once would make a homeowner hunt for the one that applies to them.
 */
export function Lifecycle({
  requestId,
  userId,
  installed,
  takedownAt,
  removed,
  isOwner,
}: {
  requestId: string;
  userId: string;
  installed: boolean;
  takedownAt: string | null;
  removed: boolean;
  isOwner: boolean;
}) {
  const [installState, installAction] = useActionState(confirmInstalled, INITIAL);
  const [takedownState, takedownAction] = useActionState(requestTakedown, INITIAL);
  const [removeState, removeAction] = useActionState(confirmRemoved, INITIAL);
  const [photo, setPhoto] = useState<string | null>(null);
  const [askingTakedown, setAskingTakedown] = useState(false);

  if (removed) return null;

  const error = installState.message ?? takedownState.message ?? removeState.message;

  // A takedown is under way: the only thing left is confirming it is out.
  if (takedownAt) {
    const deadline = new Date(new Date(takedownAt).getTime() + 48 * 3600 * 1000);
    const hoursLeft = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 3600_000));

    return (
      <Card className="p-[22px] mb-4 border-amber-edge bg-amber-wash">
        <h2 className="text-[17px] tracking-[-0.3px] mb-1.5">Coming down</h2>
        <p className="text-[13.5px] text-ink-2 mb-3.5">
          {hoursLeft > 0
            ? `Takedown was requested. ${hoursLeft} hours left on the 48-hour clock.`
            : "The 48-hour window has passed. This sign should already be out of the ground."}
        </p>
        <form action={removeAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="photoPath" value={photo ?? ""} />
          <PhotoField
            userId={userId}
            requestId={requestId}
            onUploaded={setPhoto}
            label="Photo of the yard, sign removed"
          />
          <Go label="It's out of the ground" busy="Recording…" />
        </form>
        {error && (
          <p role="alert" className="text-[12.5px] text-amber mt-2">
            {error}
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-[22px] mb-4">
      {!installed ? (
        <>
          <h2 className="text-[17px] tracking-[-0.3px] mb-1.5">Is the sign up?</h2>
          <p className="text-[13.5px] text-ink-2 mb-3.5">
            Confirm once it&rsquo;s in the ground. Delivery starts counting from
            the start date either way — this is the record that it actually
            happened.
          </p>
          <form action={installAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="photoPath" value={photo ?? ""} />
            <PhotoField
              userId={userId}
              requestId={requestId}
              onUploaded={setPhoto}
              label="Photo of the sign in the yard"
            />
            <Go label="Yes, the sign is up" busy="Recording…" />
          </form>
        </>
      ) : (
        <>
          <h2 className="text-[17px] tracking-[-0.3px] mb-1.5">The sign is up</h2>
          <p className="text-[13.5px] text-ink-2 mb-3.5">
            {isOwner
              ? "If you want it gone — for any reason at all — it comes down within 48 hours. You don't have to say why."
              : "If the city, an HOA or the homeowner objects, this comes down within 48 hours and rent is prorated to that day."}
          </p>
        </>
      )}

      {installed && !askingTakedown && (
        <button
          type="button"
          onClick={() => setAskingTakedown(true)}
          className="text-[13px] font-semibold text-amber underline underline-offset-2"
        >
          Take this sign down
        </button>
      )}

      {installed && askingTakedown && (
        <form action={takedownAction} className="border-t border-hairline pt-3.5 mt-1">
          <input type="hidden" name="requestId" value={requestId} />
          <label htmlFor="reason" className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
            {isOwner ? "Anything you want to add — optional" : "Why is it coming down?"}
          </label>
          <textarea
            id="reason"
            name="reason"
            rows={2}
            required={!isOwner}
            placeholder={isOwner ? "Not required." : "e.g. notice from the city"}
            className="w-full border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14px] mb-3 focus:outline-none focus:border-brand-mid"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Go label="Start the 48-hour clock" busy="Starting…" />
            <button
              type="button"
              onClick={() => setAskingTakedown(false)}
              className="text-[13px] text-ink-3 underline underline-offset-2"
            >
              cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-[12.5px] text-amber mt-2">
          {error}
        </p>
      )}
    </Card>
  );
}
