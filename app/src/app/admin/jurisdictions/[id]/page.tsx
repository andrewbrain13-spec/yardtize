import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import type { Jurisdiction } from "@/lib/supabase/types";
import { JurisdictionForm } from "../JurisdictionForm";

export const metadata: Metadata = {
  title: "Edit city — Yardtize",
  robots: { index: false, follow: false },
};

export default async function EditJurisdictionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { admin } = await requireAdmin(`/admin/jurisdictions/${id}`);
  if (!admin) return null;

  const { data } = await admin.from("jurisdictions").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const jurisdiction = data as Jurisdiction;

  return (
    <div className="max-w-[820px] mx-auto px-[26px] py-[52px]">
      <h1 className="text-[26px] tracking-[-0.4px]">
        {jurisdiction.name}, {jurisdiction.state}
      </h1>
      <p className="text-ink-2 mt-1.5 mb-6 max-w-[60ch]">
        Changes take effect on the site immediately, including on listings that
        are already live.
      </p>
      <JurisdictionForm jurisdiction={jurisdiction} />
    </div>
  );
}
