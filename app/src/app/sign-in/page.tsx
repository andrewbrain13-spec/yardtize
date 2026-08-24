import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getSessionProfile } from "@/lib/supabase/server";
import { SignInForm } from "./SignInForm";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: "Sign in — Yardtize" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Already signed in? Skip straight to where they were headed.
  try {
    const session = await getSessionProfile();
    if (session?.user) {
      redirect(session.profile?.role ? (next ?? "/dashboard") : "/welcome");
    }
  } catch {
    // Supabase not configured — fall through and let the form explain.
  }

  return (
    <div className="max-w-[520px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px]">
        <h1 className="text-[26px] tracking-[-0.4px] mb-2">Sign in to Yardtize</h1>
        <p className="text-ink-2 mb-7">
          List a yard or advertise on one. Same sign-in either way — you pick
          which on the next screen.
        </p>
        <SignInForm next={next} initialError={error} />
        <CodeForm next={next} />
      </Card>
    </div>
  );
}
