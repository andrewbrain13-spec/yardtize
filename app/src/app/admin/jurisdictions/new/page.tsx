import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { JurisdictionForm } from "../JurisdictionForm";

export const metadata: Metadata = {
  title: "Add a city — Yardtize",
  robots: { index: false, follow: false },
};

export default async function NewJurisdictionPage() {
  await requireAdmin("/admin/jurisdictions/new");

  return (
    <div className="max-w-[820px] mx-auto px-[26px] py-[52px]">
      <h1 className="text-[26px] tracking-[-0.4px]">Add a city</h1>
      <p className="text-ink-2 mt-1.5 mb-6 max-w-[60ch]">
        Open the city&rsquo;s sign ordinance in another tab and copy the limits
        across. Anything the code doesn&rsquo;t regulate, leave blank. You can
        save it unverified and finish later — it just won&rsquo;t be offered to
        commercial advertisers until you tick the box.
      </p>
      <JurisdictionForm />
    </div>
  );
}
