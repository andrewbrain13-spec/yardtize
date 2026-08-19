import type { Metadata } from "next";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found — Yardtize" };

export default function NotFound() {
  return (
    <div className="max-w-[560px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px] text-center">
        <div className="text-[34px] mb-3" aria-hidden="true">
          🪧
        </div>
        <h1 className="text-[26px] tracking-[-0.4px]">We couldn&rsquo;t find that page</h1>
        <p className="text-ink-2 mt-2.5 mb-6 max-w-[42ch] mx-auto">
          The link may be out of date, or the listing may have been taken down by
          its owner.
        </p>
        <div className="flex gap-2.5 justify-center flex-wrap">
          <ButtonLink href="/">Back to Yardtize</ButtonLink>
          <ButtonLink href="/browse" variant="ghost">
            Browse yards
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
