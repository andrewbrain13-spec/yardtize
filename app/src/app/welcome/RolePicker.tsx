"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { chooseRole, type RoleState } from "./actions";
import { buttonClass } from "@/components/ui";
import type { UserRole } from "@/lib/supabase/types";

const OPTIONS: Array<{ value: UserRole; title: string; body: string }> = [
  {
    value: "homeowner",
    title: "I have a yard to list",
    body: "See what your corner is worth from real traffic counts, and get paid to host one tasteful sign.",
  },
  {
    value: "business",
    title: "I want to advertise",
    body: "Browse yards ranked by vehicles per day and request the corners that fit your campaign.",
  },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary", "big")} w-full mt-2 disabled:opacity-60`}
    >
      {pending ? "Setting up…" : "Continue →"}
    </button>
  );
}

export function RolePicker({ next }: { next?: string }) {
  const [state, formAction] = useActionState<RoleState, FormData>(chooseRole, {});
  const [selected, setSelected] = useState<UserRole>("homeowner");

  return (
    <form action={formAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">How will you use Yardtize?</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex gap-2.5 items-start border-[1.5px] rounded-[11px] px-3.5 py-3 cursor-pointer transition-colors ${
              selected === option.value
                ? "border-brand-mid bg-brand-wash"
                : "border-hairline"
            }`}
          >
            <input
              type="radio"
              name="role"
              value={option.value}
              checked={selected === option.value}
              onChange={() => setSelected(option.value)}
              className="mt-1 accent-brand"
            />
            <span>
              <b className="block text-[14.5px]">{option.title}</b>
              <span className="text-[12.5px] text-ink-2">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mt-3">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
      <p className="text-[12.5px] text-ink-3 text-center mt-3">
        You can do both later — this just sets where we drop you first.
      </p>
    </form>
  );
}
