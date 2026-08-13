import { Card } from "../ui";

const REASONS = [
  {
    icon: "👁️",
    title: "Eye level, not sky level",
    body: "Drivers look at yards and corners — not up at the freeway blur.",
  },
  {
    icon: "🚦",
    title: "Stoplight dwell time",
    body: "A signalized corner means captive attention, 30–90 seconds at a time.",
  },
  {
    icon: "📊",
    title: "Priced on real data",
    body: "Rates come from official state AADT traffic counts, not vibes.",
  },
  {
    icon: "🛡️",
    title: "Compliance built-in",
    body: "Sign size, placement and duration checked against your city's code — with a 48-hour takedown guarantee.",
  },
];

export function WhyYard() {
  return (
    <section className="max-w-[1120px] mx-auto px-[26px] pt-[58px] pb-2">
      <h2 className="text-[28px] tracking-[-0.5px] mb-2">
        Why a yard beats a billboard
      </h2>
      <p className="text-ink-2 max-w-[62ch] mb-7">
        Billboard rates are a function of traffic. So are ours — except your sign
        sits at eye level, at a red light, in front of a real home.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {REASONS.map(({ icon, title, body }) => (
          <Card key={title} className="p-[18px]">
            <div
              className="grid place-items-center w-[34px] h-[34px] rounded-[9px] bg-brand-wash-2 text-[17px] mb-2.5"
              aria-hidden="true"
            >
              {icon}
            </div>
            <b className="block mb-1">{title}</b>
            <span className="text-[13.5px] text-ink-2">{body}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}
