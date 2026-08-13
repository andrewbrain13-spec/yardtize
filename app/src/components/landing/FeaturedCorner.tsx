import { Badge, Stat } from "../ui";
import { KARNES, KARNES_AADT_SUM, KARNES_TRAFFIC_SOURCE } from "@/lib/karnes";
import { suggestRate } from "@/lib/rate";

const rate = suggestRate({
  aadtSum: KARNES_AADT_SUM,
  signalized: KARNES.signalized,
  cornerLot: KARNES.cornerLot,
});

/** Aerial-illustration card for the anchor property — CSS art, as in the mockup. */
export function FeaturedCorner() {
  return (
    <div className="bg-surface border border-edge rounded-panel shadow-lift overflow-hidden">
      <div
        className="h-[225px] relative"
        aria-hidden="true"
        style={{
          background: `linear-gradient(rgba(20,60,30,.18),rgba(20,60,30,.18)),
            repeating-linear-gradient(45deg,#31402f 0 26px,#3a4a37 26px 52px)`,
        }}
      >
        {/* SW Trafficway */}
        <div className="absolute inset-y-0 left-[56%] w-11 bg-[#4a4a48] border-x-2 border-[#6b6b68]" />
        <div
          className="absolute inset-y-0 w-[3px] left-[calc(56%+21px)]"
          style={{
            background:
              "repeating-linear-gradient(180deg,#d9cf72 0 14px,transparent 14px 30px)",
          }}
        />
        {/* W 31st St */}
        <div className="absolute inset-x-0 top-[54%] h-[34px] bg-[#4a4a48] border-y-2 border-[#6b6b68]" />
        {/* The sign */}
        <div className="absolute left-[38%] top-[26%] w-16 h-11 bg-white rounded-md border-2 border-brand grid place-items-center text-[9.5px] font-extrabold text-brand-deep text-center leading-[1.15] shadow-[0_6px_16px_rgba(0,0,0,.35)]">
          YOUR SIGN
          <br />
          HERE
          <span className="absolute -bottom-3.5 left-1/2 w-1 h-3.5 bg-[#8a8a86]" />
        </div>
      </div>

      <div className="px-[18px] pt-4 pb-[18px]">
        <div className="flex justify-between items-center gap-2.5">
          <div className="font-bold text-[15.5px]">
            {KARNES.address} · {KARNES.city}, {KARNES.state}
          </div>
          <Badge tone="gold">★ Featured corner</Badge>
        </div>
        <div className="text-[12.5px] text-ink-3 mt-[3px]">
          Signalized intersection · {KARNES.intersection}
        </div>
        <div className="flex mt-[13px] border-t border-hairline pt-[13px]">
          <Stat
            label="Vehicles per day"
            value={`${(KARNES_AADT_SUM / 1000).toFixed(1)}K`}
            sub={KARNES_TRAFFIC_SOURCE}
          />
          <div className="border-l border-hairline pl-3.5 flex-1">
            <Stat
              label="Suggested rate"
              value={`$${rate.monthly}`}
              sub="per month"
            />
          </div>
          <div className="border-l border-hairline pl-3.5 flex-1">
            <Stat label="Stoplight dwell" value="Yes" sub="signalized ✓" />
          </div>
        </div>
      </div>
    </div>
  );
}
