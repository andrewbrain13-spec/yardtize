import { Hero } from "@/components/landing/Hero";
import { StatStrip } from "@/components/landing/StatStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyYard } from "@/components/landing/WhyYard";
import { ComingNext } from "@/components/landing/ComingNext";
import { Elsewhere } from "@/components/landing/Elsewhere";

export default function Home() {
  return (
    <>
      <Hero />
      <StatStrip />
      <HowItWorks />
      <WhyYard />
      <Elsewhere />
      <ComingNext />
    </>
  );
}
