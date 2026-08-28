"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinWaitlist, type WaitlistState } from "@/app/waitlist/actions";
import { buttonClass } from "./ui";

const INITIAL: WaitlistState = { status: "idle" };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass()} shrink-0 disabled:opacity-60`}>
      {pending ? "Adding…" : label}
    </button>
  );
}

/**
 * Kansas City is the whole pilot, so most of the country hits a wall on this
 * site. Every one of them is a data point about where to go next, and asking
 * for an email is cheaper than guessing.
 *
 * `source` says where they hit the wall, which is the part that carries the
 * signal — an out-of-area homeowner and an advertiser with no inventory in
 * their city are two different problems.
 */
export function WaitlistForm({
  source,
  role,
  city,
  state,
  label = "Tell me when you're here",
  placeholder = "you@example.com",
  askPlace = true,
}: {
  source: string;
  role?: "homeowner" | "business";
  city?: string;
  state?: string;
  label?: string;
  placeholder?: string;
  /** Hidden when the page already knows where they are. */
  askPlace?: boolean;
}) {
  const [result, action] = useActionState(joinWaitlist, INITIAL);

  if (result.status === "joined") {
    return (
      <p className="text-[13.5px] text-good-text bg-brand-wash border border-brand-wash-2 rounded-[10px] px-3.5 py-2.5">
        ✓ You&rsquo;re on the list. We&rsquo;ll write when Yardtize reaches you — nothing else.
      </p>
    );
  }

  const field =
    "border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14.5px] focus:outline-none focus:border-brand-mid";

  return (
    <form action={action}>
      <input type="hidden" name="source" value={source} />
      {role && <input type="hidden" name="role" value={role} />}
      {!askPlace && (
        <>
          <input type="hidden" name="city" value={city ?? ""} />
          <input type="hidden" name="state" value={state ?? ""} />
        </>
      )}

      <div className="flex gap-2 flex-wrap">
        <input
          type="email"
          name="email"
          required
          placeholder={placeholder}
          aria-label="Email address"
          className={`${field} flex-1 min-w-[200px]`}
        />
        {askPlace && (
          <>
            <input
              name="city"
              defaultValue={city}
              placeholder="City"
              aria-label="City"
              className={`${field} w-[140px]`}
            />
            <input
              name="state"
              defaultValue={state}
              placeholder="ST"
              aria-label="State"
              maxLength={2}
              className={`${field} w-[70px] uppercase`}
            />
          </>
        )}
        <Submit label={label} />
      </div>

      {result.status === "error" && (
        <p role="alert" className="text-[12.5px] text-amber mt-2">
          {result.message}
        </p>
      )}
    </form>
  );
}
