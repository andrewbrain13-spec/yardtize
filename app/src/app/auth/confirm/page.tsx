import type { Metadata } from "next";
import Link from "next/link";
import { Card, buttonClass } from "@/components/ui";
import { ConfirmButton } from "./ConfirmButton";

export const metadata: Metadata = {
  title: "Confirm your sign-in — Yardtize",
  robots: { index: false, follow: false },
};

/**
 * Where a magic link lands.
 *
 * This page does nothing on load, which is the entire point — see actions.ts.
 * Opening it costs the token nothing, so the scanners that open every link in
 * a business inbox leave the real person's sign-in intact.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  return (
    <div className="max-w-[460px] mx-auto px-[26px] py-[80px]">
      <Card className="p-[38px] text-center">
        <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-brand-wash-2 text-brand-deep text-[22px] mb-4">
          ✓
        </span>
        <h1 className="text-[24px] tracking-[-0.5px]">You&rsquo;re nearly in</h1>

        {token_hash ? (
          <>
            <p className="text-ink-2 mt-2.5 mb-6 text-[14.5px]">
              One tap to finish signing in. We ask because email systems open
              links automatically, and a sign-in link only works once.
            </p>
            <ConfirmButton tokenHash={token_hash} type={type ?? "magiclink"} next={next ?? ""} />
          </>
        ) : (
          <>
            <p className="text-ink-2 mt-2.5 mb-6 text-[14.5px]">
              This link is missing its sign-in code — some mail clients trim
              long links. Ask for a fresh one and it&rsquo;ll come straight
              through.
            </p>
            <Link href="/sign-in" className={`${buttonClass("primary", "big")} w-full`}>
              Get a new link →
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
