"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink, type SignInState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: SignInState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass("primary", "big")} w-full disabled:opacity-60`}>
      {pending ? "Sending…" : "Email me a sign-in link"}
    </button>
  );
}

export function SignInForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [state, formAction] = useActionState(sendMagicLink, INITIAL);

  // An expired or already-used link redirects here with ?error=. Without this
  // the visitor just saw an empty form and no explanation.
  const message = state.status === "error" ? state.message : initialError;
  const showError = Boolean(message) && state.status !== "sent";

  if (state.status === "sent") {
    return (
      <div className="text-center">
        <div className="grid place-items-center w-[62px] h-[62px] mx-auto mb-4 rounded-full bg-brand-wash-2 text-good-text text-[28px]">
          ✓
        </div>
        <h2 className="text-[22px]">Check your email</h2>
        <p className="text-ink-2 mt-3 max-w-[38ch] mx-auto">
          We sent a sign-in link to <b className="text-ink">{state.email}</b>. It
          works once and expires in an hour.
        </p>
        <p className="text-[12.5px] text-ink-3 mt-4">
          No email after a minute? Check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label htmlFor="email" className="text-[12.5px] font-semibold text-ink-2 ml-0.5">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        defaultValue={state.email}
        aria-describedby={showError ? "signin-error" : undefined}
        className="w-full border-[1.5px] border-hairline bg-white rounded-[11px] px-3.5 py-3 text-[15.5px] focus:outline-none focus:border-brand-mid"
      />
      {showError ? (
        <p id="signin-error" role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2">
          {message}
        </p>
      ) : null}
      <SubmitButton />
      <p className="text-[12.5px] text-ink-3 text-center mt-1">
        No password needed. We&rsquo;ll email you a secure link.
      </p>
    </form>
  );
}
