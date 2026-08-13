import { Card } from "../ui";

const TILES = [
  {
    label: "Traffic data source",
    value: "Official",
    sub: "MoDOT & KDOT annual counts",
  },
  { label: "Signs per yard", value: "1", sub: "always — a platform rule" },
  {
    label: "Compliance check",
    value: "Built-in",
    sub: "sized & placed to your city's code",
  },
  {
    label: "Effort for homeowners",
    value: "~0",
    sub: "we handle the sign, the rules & the paperwork",
  },
];

export function StatStrip() {
  return (
    <section className="max-w-[1120px] mx-auto mt-[26px] px-[26px] grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {TILES.map(({ label, value, sub }) => (
        <Card key={label} className="px-[18px] py-4">
          <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
          <div className="text-[26px] font-bold tracking-[-0.3px] mt-px">
            {value}
          </div>
          <div className="text-[11.5px] text-ink-2">{sub}</div>
        </Card>
      ))}
    </section>
  );
}
