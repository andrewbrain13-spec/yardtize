import { Card } from "../ui";

type Track = {
  who: string;
  tone: "homeowner" | "business";
  heading: string;
  steps: Array<{ title: string; body: string }>;
};

const TRACKS: Track[] = [
  {
    who: "HOMEOWNERS",
    tone: "homeowner",
    heading: "Turn traffic into income",
    steps: [
      {
        title: "Enter your address",
        body: "We pull up an aerial view of your property and the official traffic counts for the roads you front.",
      },
      {
        title: "Place your sign spot",
        body: "Drag the pin to where a sign could stand. We check your city's size and setback rules automatically.",
      },
      {
        title: "Set your rate & go live",
        body: "Take our traffic-based suggested rate or set your own, and approve every advertiser before anything goes up.",
      },
    ],
  },
  {
    who: "BUSINESSES & CAMPAIGNS",
    tone: "business",
    heading: "Own the best corners in town",
    steps: [
      {
        title: "Browse by traffic",
        body: "Every listing shows real vehicles-per-day from state DOT data — pick corners, not guesses.",
      },
      {
        title: "Request a placement",
        body: "Upload your sign design, pick a duration, and choose self-install or our install crew.",
      },
      {
        title: "Owner approves, sign goes up",
        body: "The homeowner reviews your rendering and approves. In-platform lease signing and payments are coming next.",
      },
    ],
  },
];

const TONES = {
  homeowner: "bg-brand-wash-2 text-brand-deep",
  business: "bg-biz-wash text-biz",
} as const;

export function HowItWorks() {
  return (
    <section className="max-w-[1120px] mx-auto px-[26px] pt-[58px] pb-2">
      <h2 className="text-[28px] tracking-[-0.5px] mb-2">How it works</h2>
      <p className="text-ink-2 max-w-[62ch] mb-7">
        A marketplace with two sides — and Yardtize managing what sits between
        them: the pricing, the compliance check, and the sign itself.
      </p>
      <div className="grid lg:grid-cols-2 gap-4">
        {TRACKS.map((track) => (
          <Card key={track.who} className="p-[22px]">
            {/* min-height keeps the two cards' step lists on the same baseline
                when the longer role badge pushes its heading to a second line. */}
            <h3 className="text-[17px] mb-3.5 flex items-center gap-[9px] flex-wrap lg:min-h-[46px]">
              <span
                className={`text-[11px] font-extrabold tracking-[0.7px] rounded-full px-[9px] py-[3px] ${TONES[track.tone]}`}
              >
                {track.who}
              </span>
              {track.heading}
            </h3>
            <ol className="flex flex-col gap-[13px]">
              {track.steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="shrink-0 grid place-items-center w-[26px] h-[26px] rounded-full bg-brand-wash-2 text-brand-deep text-[13px] font-extrabold">
                    {i + 1}
                  </span>
                  <span>
                    <b className="block font-semibold">{step.title}</b>
                    <span className="text-ink-2 text-[13.5px]">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </section>
  );
}
