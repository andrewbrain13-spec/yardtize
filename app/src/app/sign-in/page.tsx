import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Sign in — Yardtize" };

export default function SignInPage() {
  return (
    <ComingSoon
      eyebrow="NEXT IN THE BUILD"
      title="Accounts are coming"
      blurb="Sign-in lands in the next milestone: enter your email, get a magic link, and pick whether you're here to list a yard or advertise on one."
      bullets={[
        "No passwords — a single-use link arrives in your inbox.",
        "Pick your role once: homeowner or business.",
        "Homeowners get an inbox of placement requests; businesses get the listing map.",
      ]}
    />
  );
}
