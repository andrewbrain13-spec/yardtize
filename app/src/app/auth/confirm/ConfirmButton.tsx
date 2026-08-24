"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { completeSignIn, type ConfirmState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: ConfirmState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary", "big")} w-full disabled:opacity-60`}
    >
      {pending ? "Signing you in…" : "Sign in to Yardtize →"}
    </button>
  );
}

export function ConfirmButton({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: string;
  next: string;
}) {
  const [result, action] = useActionState(completeSignIn, INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Submit />
      {result.error && (
        <div className="mt-4">
          <p role="alert" className="text-[13.5px] text-amber bg-amber-wash border border-amber-edge rounded-[10px] px-3.5 py-2.5">
            {result.error}
          </p>
          <Link href="/sign-in" className={`${buttonClass("ghost")} mt-3`}>
            Get a new link
          </Link>
        </div>
      )}
    </form>
  );
}
