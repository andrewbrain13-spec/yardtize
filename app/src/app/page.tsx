import { Hero } from "@/components/landing/Hero";
import { StatStrip } from "@/components/landing/StatStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyYard } from "@/components/landing/WhyYard";
import { ComingNext } from "@/components/landing/ComingNext";

export default function Home() {
  return (
    <>
      <Hero />
      <StatStrip />
      <HowItWorks />
      <WhyYard />
      <ComingNext />
    </>
  );
}
