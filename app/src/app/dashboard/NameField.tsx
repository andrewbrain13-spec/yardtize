"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveName, type NameState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: NameState = { status: "idle" };

function Save({ hasName }: { hasName: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass("ghost")} shrink-0 disabled:opacity-60`}>
      {pending ? "Saving…" : hasName ? "Update" : "Save"}
    </button>
  );
}

/** Shown on the account card, because a placement summary signs better with a name on it. */
export function NameField({ current }: { current: string | null }) {
  const [result, action] = useActionState(saveName, INITIAL);

  return (
    <form action={action} className="mb-7">
      <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5" htmlFor="fullName">
        Your name {current ? "" : "— used on placement agreements"}
      </label>
      <div className="flex gap-2 flex-wrap">
        <input
          id="fullName"
          name="fullName"
          defaultValue={current ?? ""}
          placeholder="Andrew Brain"
          className="border-[1.5px] border-hairline bg-white rounded-[11px] px-3.5 py-2.5 text-[14.5px] flex-1 min-w-[200px] focus:outline-none focus:border-brand-mid"
        />
        <Save hasName={Boolean(current)} />
      </div>
      {result.status === "saved" && (
        <p className="text-[12.5px] text-good-text mt-1.5">Saved.</p>
      )}
      {result.status === "error" && (
        <p role="alert" className="text-[12.5px] text-amber mt-1.5">{result.message}</p>
      )}
    </form>
  );
}
