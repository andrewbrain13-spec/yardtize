"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithCode, type ConfirmState } from "@/app/auth/confirm/actions";
import { buttonClass } from "@/components/ui";

const INITIAL: ConfirmState = {};

const field =
  "border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[15px] focus:outline-none focus:border-brand-mid";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass("ghost")} shrink-0 disabled:opacity-60`}>
      {pending ? "Checking…" : "Sign in"}
    </button>
  );
}

/**
 * The way in when the link itself doesn't survive the journey — a mail system
 * that rewrites or truncates URLs, a scanner that opens it first, a link
 * opened in an app that can't hold a session. The same email carries a code.
 *
 * Reachable whether or not this browser is the one that asked for the code:
 * people close the tab, or read the email on a different machine, and a code
 * that only works in the tab that requested it solves half the problem.
 */
export function CodeForm({
  email,
  next,
  open: initiallyOpen = false,
}: {
  email?: string;
  next?: string;
  /** Expanded straight after sending, collapsed on a cold sign-in page. */
  open?: boolean;
}) {
  const [result, action] = useActionState(signInWithCode, INITIAL);
  const [open, setOpen] = useState(initiallyOpen);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-[13px] font-semibold text-brand-deep underline underline-offset-2"
      >
        Already have a code from an earlier email?
      </button>
    );
  }

  return (
    <form action={action} className="mt-6 pt-5 border-t border-hairline text-left">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label htmlFor="code" className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
        {email ? "Or type the code from the email" : "Type the code from your email"}
      </label>

      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          aria-label="Email address"
          className={`${field} w-full mb-2`}
        />
      )}

      <div className="flex gap-2">
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="12345678"
          className={`${field} flex-1 min-w-0 tracking-[0.14em] font-semibold tabular-nums`}
        />
        <Submit />
      </div>

      {result.error && (
        <p role="alert" className="text-[12.5px] text-amber mt-2">
          {result.error}
        </p>
      )}
    </form>
  );
}
