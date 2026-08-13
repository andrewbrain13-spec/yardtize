const ITEMS = [
  "Payments & escrow",
  "In-platform lease e-signing",
  "Automated monthly payouts",
  "HOA covenant checks",
  "Metros beyond Kansas City",
];

/**
 * Phase 1 ships the traffic + compliance engine. Everything the brief cut is
 * named here rather than implied by the rest of the page.
 */
export function ComingNext() {
  return (
    <section className="max-w-[1120px] mx-auto px-[26px] pt-[58px]">
      <div className="bg-brand-wash border border-brand-wash-2 rounded-card px-[22px] py-[18px] flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <span className="text-[11px] font-extrabold tracking-[0.7px] text-brand-deep bg-brand-wash-2 rounded-full px-[9px] py-[3px]">
          COMING NEXT
        </span>
        <span className="text-[13.5px] text-ink-2">
          Live today: traffic-based pricing and per-city compliance screening.
          Still in the build:
        </span>
        <span className="text-[13.5px] text-ink font-medium">
          {ITEMS.join(" · ")}
        </span>
      </div>
    </section>
  );
}
