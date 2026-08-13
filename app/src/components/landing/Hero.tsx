import { ButtonLink } from "../ui";
import { FeaturedCorner } from "./FeaturedCorner";

export function Hero() {
  return (
    <section className="max-w-[1120px] mx-auto px-[26px] pt-[74px] pb-[30px] grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-center max-lg:pt-10">
      <div>
        <h1 className="text-[36px] sm:text-[46px] tracking-[-1.2px] font-extrabold">
          Your yard is <em className="not-italic text-brand">prime ad space</em>.
          <br />
          Get paid for it.
        </h1>
        <p className="mt-[18px] mb-[26px] text-[17.5px] text-ink-2 max-w-[52ch]">
          Yardtize matches high-traffic yards with local businesses and campaigns
          that want eye-level visibility. We price your placement with official
          state traffic data and screen it against your city&rsquo;s actual sign
          code — so you know what your corner is worth, and that it&rsquo;s legal.
        </p>
        <div className="flex gap-3 flex-wrap">
          <ButtonLink href="/list" size="big">
            List your yard →
          </ButtonLink>
          <ButtonLink href="/browse" variant="ghost" size="big">
            Browse yards for your business
          </ButtonLink>
        </div>
        <p className="text-[12.5px] text-ink-3 mt-4">
          One tasteful sign per yard. 48-hour takedown guarantee. Yardtize handles
          any city notice — and pays any fine.
        </p>
      </div>

      <FeaturedCorner />
    </section>
  );
}
