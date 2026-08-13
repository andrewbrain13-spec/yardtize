import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "For businesses — Yardtize" };

export default function BrowsePage() {
  return (
    <ComingSoon
      eyebrow="NEXT IN THE BUILD"
      title="Yards for your business"
      blurb="The business portal is on its way: a map of live Kansas City metro listings, ranked by the traffic that actually passes them."
      bullets={[
        "Browse every listing with real vehicles-per-day from state DOT data, plus badges for signalized corners and corner lots.",
        "Request a placement with your sign rendering, size, and duration — including the Sep 19–Nov 5 election window.",
        "Choose self-install or a Yardtize install crew. The homeowner reviews your design and approves.",
      ]}
    />
  );
}
