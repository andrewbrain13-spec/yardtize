"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInWithCode, type ConfirmState } from "@/app/auth/confirm/actions";
import { buttonClass } from "@/components/ui";

const INITIAL: ConfirmState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass("ghost")} shrink-0 disabled:opacity-60`}>
      {pending ? "Checking…" : "Sign in"}
    </button>
  );
}

/**
 * The way in when the link itself doesn't survive the journey — a mail client
 * that rewrites or truncates URLs, a scanner that opens it first, a link
 * opened in an app that can't hold a session. The same email carries a code.
 */
export function CodeForm({ email, next }: { email: string; next?: string }) {
  const [result, action] = useActionState(signInWithCode, INITIAL);

  return (
    <form action={action} className="mt-6 pt-5 border-t border-hairline text-left">
      <input type="hidden" name="email" value={email} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label htmlFor="code" className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
        Or type the code from the email
      </label>
      <div className="flex gap-2">
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="12345678"
          className="flex-1 min-w-0 border-[1.5px] border-hairline bg-white rounded-[11px] px-3.5 py-2.5 text-[16px] tracking-[0.14em] font-semibold tabular-nums focus:outline-none focus:border-brand-mid"
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
