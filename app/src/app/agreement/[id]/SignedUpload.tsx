"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { submitSignedLease, type UploadState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: UploadState = { status: "idle" };

function Send({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className={`${buttonClass("primary", "big")} w-full mt-3 disabled:opacity-50`}
    >
      {pending ? "Sending…" : "Send it to Yardtize for review →"}
    </button>
  );
}

/**
 * Send back a signed copy.
 *
 * The file goes straight to Storage from the browser; the server action only
 * records the path. Photographs are as welcome as PDFs, because most people
 * will print this, sign it with a pen and take a picture of it — telling them
 * to produce a PDF would be inventing a requirement.
 */
export function SignedUpload({ leaseId, userId }: { leaseId: string; userId: string }) {
  const [result, action] = useActionState(submitSignedLease, INITIAL);
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(picked: File) {
    setError(null);
    if (picked.size > 25 * 1024 * 1024) {
      setError("That file is over 25 MB. A smaller photo or a PDF will do.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const extension = picked.name.split(".").pop()?.toLowerCase() ?? "pdf";
      // Foldered by user id — the storage policy requires it.
      const path = `${userId}/${leaseId}-${Date.now()}.${extension}`;

      /*
       * Raced against a clock. An upload that stalls rather than failing —
       * a phone that loses signal halfway through a photo — would otherwise
       * leave this stuck on "Uploading…" with a dead button and no
       * explanation, which is a worse failure than an error message.
       */
      const timeout = new Promise<{ timedOut: true }>((resolve) =>
        setTimeout(() => resolve({ timedOut: true }), 60_000),
      );
      const outcome = await Promise.race([
        supabase.storage.from("signed-leases").upload(path, picked, { upsert: true }),
        timeout,
      ]);

      if ("timedOut" in outcome) {
        setError("That's taking too long — check your connection and try again.");
      } else if (outcome.error) {
        setError("The upload didn't go through. Try again in a moment.");
      } else {
        setFile({ path, name: picked.name });
      }
    } catch {
      setError("The upload didn't go through. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (result.status === "done") {
    return (
      <p className="text-[13.5px] text-good-text bg-brand-wash border border-brand-wash-2 rounded-[10px] px-3.5 py-3">
        ✓ Sent. Yardtize checks the signatures and confirms — usually the same
        day. You&rsquo;ll get an email either way, and the placement goes live
        once it&rsquo;s confirmed.
      </p>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="leaseId" value={leaseId} />
      <input type="hidden" name="path" value={file?.path ?? ""} />

      <label
        htmlFor="signed"
        className="block border-[1.5px] border-dashed border-edge rounded-[12px] px-4 py-5 text-center cursor-pointer hover:bg-brand-wash"
      >
        <span className="block text-[14px] font-semibold text-brand-deep">
          {busy ? "Uploading…" : file ? `✓ ${file.name}` : "Attach the signed copy"}
        </span>
        <span className="block text-[12.5px] text-ink-2 mt-1">
          A PDF, or a photo of the signed pages. Both signatures on it.
        </span>
        <input
          id="signed"
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void onPick(picked);
          }}
        />
      </label>

      {error && (
        <p role="alert" className="text-[12.5px] text-amber mt-2">
          {error}
        </p>
      )}
      {result.status === "error" && (
        <p role="alert" className="text-[12.5px] text-amber mt-2">
          {result.message}
        </p>
      )}

      <Send ready={Boolean(file)} />
    </form>
  );
}
