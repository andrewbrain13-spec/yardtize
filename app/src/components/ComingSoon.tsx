import { ButtonLink, Card } from "./ui";

/**
 * Placeholder for a flow that lands in a later milestone. Every nav target
 * resolves to a real page so the deployed demo never dead-ends on a 404.
 */
export function ComingSoon({
  eyebrow,
  title,
  blurb,
  bullets,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  bullets: string[];
}) {
  return (
    <div className="max-w-[720px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px]">
        <div className="text-[11px] font-bold tracking-[0.7px] text-amber bg-amber-wash border border-amber-edge rounded-full px-2.5 py-[3px] inline-block">
          {eyebrow}
        </div>
        <h1 className="text-[30px] tracking-[-0.6px] mt-4">{title}</h1>
        <p className="text-ink-2 mt-3 text-[16px] max-w-[52ch]">{blurb}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-[9px] items-start text-[14px]">
              <span className="shrink-0 grid place-items-center w-[18px] h-[18px] mt-[3px] rounded-full bg-brand-wash-2 text-good-text text-[11px] font-extrabold">
                ✓
              </span>
              <span className="text-ink-2">{bullet}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <ButtonLink href="/" variant="ghost">
            ← Back to how it works
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
