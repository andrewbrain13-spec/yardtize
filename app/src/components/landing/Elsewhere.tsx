import Link from "next/link";
import { WaitlistForm } from "@/components/WaitlistForm";

/**
 * The pilot is one metro. Everyone else who reads this page has to be told so
 * plainly — and then given something to do about it.
 */
export function Elsewhere() {
  return (
    <section className="max-w-[1120px] mx-auto px-[26px] pt-[58px]">
      <div className="bg-surface border border-hairline rounded-card p-[26px] sm:p-[32px]">
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div>
            <h2 className="text-[22px] tracking-[-0.4px]">Not in Kansas City?</h2>
            <p className="text-ink-2 mt-2.5 text-[14.5px] max-w-[46ch]">
              Yardtize starts in the KC metro because that&rsquo;s where we&rsquo;ve
              read the sign codes line by line and verified the traffic counts.
              Every other city has the same public traffic data waiting — we just
              haven&rsquo;t done the compliance work there yet.
            </p>
            <p className="text-ink-2 mt-2.5 text-[14.5px] max-w-[46ch]">
              Tell us where you are and we&rsquo;ll write when we get to you.
              Which cities fill up first is how we decide where to go.
            </p>
          </div>
          <div>
            <WaitlistForm source="landing" label="Add me" />
            <p className="text-[12px] text-ink-3 mt-2.5">
              One email when Yardtize reaches your city. No newsletter.{" "}
              <Link href="/coverage" className="text-brand-deep underline underline-offset-2">
                See where we operate
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
