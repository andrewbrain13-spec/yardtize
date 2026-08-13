import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "List your yard — Yardtize" };

export default function ListPage() {
  return (
    <ComingSoon
      eyebrow="NEXT IN THE BUILD"
      title="List your yard"
      blurb="The homeowner wizard is the next thing we're wiring up. Three steps, no paperwork, and you approve every advertiser before a sign ever goes in the ground."
      bullets={[
        "Enter your address and see your property from above on a satellite map.",
        "Drag a pin to where a sign would stand — we look up the official MoDOT or KDOT traffic counts for the roads you front.",
        "See your city's actual sign rules checked against your placement, with a suggested monthly rate you can adjust.",
      ]}
    />
  );
}
