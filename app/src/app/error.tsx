"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass, Card } from "@/components/ui";

/**
 * Catches anything that throws while rendering a page, so a failure in one
 * screen shows an explanation and a way out instead of a blank white page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the Vercel runtime logs, with the digest to correlate.
    console.error("Unhandled error rendering page:", error);
  }, [error]);

  return (
    <div className="max-w-[560px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px] text-center">
        <div className="text-[34px] mb-3" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="text-[26px] tracking-[-0.4px]">Something went wrong</h1>
        <p className="text-ink-2 mt-2.5 mb-6 max-w-[44ch] mx-auto">
          That page didn&rsquo;t load. It&rsquo;s usually temporary — try again,
          and if it keeps happening let us know.
        </p>
        <div className="flex gap-2.5 justify-center flex-wrap">
          <button onClick={reset} className={buttonClass()}>
            Try again
          </button>
          <Link href="/" className={buttonClass("ghost")}>
            Back to Yardtize
          </Link>
        </div>
        {error.digest && (
          <p className="text-[11.5px] text-ink-3 mt-5">Reference: {error.digest}</p>
        )}
      </Card>
    </div>
  );
}
