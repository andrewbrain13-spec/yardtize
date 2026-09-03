import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Estimator } from "./Estimator";

export const metadata: Metadata = {
  title: "What's your yard worth? — Yardtize",
  description:
    "Type your address and see the official traffic count for the roads outside it, and what a sign in that yard is worth per month. Real state and federal data, anywhere in the US.",
};

/**
 * The one page a stranger can get a real number out of.
 *
 * Everything else on Yardtize needs an account, which is right for a
 * marketplace and wrong for the first question anybody asks. This answers it
 * with the same arithmetic every listing uses, from the same published counts,
 * for any address in the country — and then says plainly where the sign code
 * has been read and where it has not.
 */
export default function WorthPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  return (
    <div className="max-w-[820px] mx-auto px-[26px] py-[56px]">
      <h1 className="text-[clamp(28px,5vw,38px)] tracking-[-0.8px] leading-[1.1]">
        What&rsquo;s your yard worth?
      </h1>
      <p className="text-ink-2 mt-3 mb-6 max-w-[54ch] text-[16.5px]">
        Type your address. We&rsquo;ll show you the official traffic count for
        the roads outside it, and what a single sign in that yard is worth a
        month. No account, no sales call.
      </p>

      {apiKey ? (
        <Estimator apiKey={apiKey} />
      ) : (
        <Card className="p-[22px]">
          <p className="text-[13.5px]">
            Address lookup isn&rsquo;t configured on this deployment.
          </p>
        </Card>
      )}

      <Card className="p-[22px] mt-8">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2">
          Why we can answer this at all
        </h2>
        <p className="text-[13.5px] text-ink-2 max-w-[60ch]">
          Every state counts its roads and reports those counts to the federal
          government. Missouri and Kansas publish their own, more current, and
          we use those where they exist; everywhere else we read the federal
          figures. It is public data either way, and we show you which agency
          and which year so you can check it. Nobody has to take our word for
          what a corner is worth.
        </p>
        <p className="text-[13.5px] text-ink-2 mt-2.5 max-w-[60ch]">
          Yardtize is running its pilot in the Kansas City metro, which is where
          the sign codes have been read. The traffic works anywhere today; the
          rules take longer, and we would rather say so than put a sign somewhere
          it is not allowed.
        </p>
        <p className="text-[13px] text-ink-3 mt-3">
          <Link href="/coverage" className="text-brand underline underline-offset-2">
            Where we operate
          </Link>
        </p>
      </Card>
    </div>
  );
}
