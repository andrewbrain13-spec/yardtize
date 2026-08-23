import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import type { Jurisdiction, Listing } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Cities — Yardtize",
  robots: { index: false, follow: false },
};

export default async function JurisdictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const { admin } = await requireAdmin("/admin/jurisdictions");
  if (!admin) return null;

  const [{ data: rows }, { data: listingRows }] = await Promise.all([
    admin.from("jurisdictions").select("*").order("is_verified", { ascending: false }).order("name"),
    admin.from("listings").select("id, jurisdiction_id"),
  ]);

  const jurisdictions = (rows ?? []) as Jurisdiction[];
  const listings = (listingRows ?? []) as Pick<Listing, "id" | "jurisdiction_id">[];

  const counts = new Map<string, number>();
  for (const l of listings) {
    if (l.jurisdiction_id) counts.set(l.jurisdiction_id, (counts.get(l.jurisdiction_id) ?? 0) + 1);
  }

  const verified = jurisdictions.filter((j) => j.is_verified && !j.is_default);
  const pending = jurisdictions.filter((j) => !j.is_verified && !j.is_default);
  const fallback = jurisdictions.find((j) => j.is_default);

  return (
    <div className="max-w-[900px] mx-auto px-[26px] py-[52px]">
      <div className="flex justify-between items-start gap-4 flex-wrap mb-2">
        <div>
          <h1 className="text-[26px] tracking-[-0.4px]">Cities</h1>
          <p className="text-ink-2 mt-1.5 max-w-[58ch]">
            The compliance engine, as data. Adding a city here is what lets
            homeowners there list a yard and see their own code checked — no
            deploy involved.
          </p>
        </div>
        <ButtonLink href="/admin/jurisdictions/new">Add a city</ButtonLink>
      </div>

      {saved && (
        <p className="text-[13.5px] text-good-text bg-brand-wash border border-brand-wash-2 rounded-[10px] px-3.5 py-2.5 my-4">
          ✓ Saved. It is live on the site now.
        </p>
      )}

      <Card className="p-[22px] mt-5">
        <h2 className="text-[17px] tracking-[-0.3px] mb-1">
          Verified <span className="text-ink-3 font-normal text-[14px]">({verified.length})</span>
        </h2>
        <p className="text-[12.5px] text-ink-2 mb-2">
          Code read line by line. Full product available, commercial lanes included.
        </p>
        {verified.length === 0 ? (
          <p className="text-[13.5px] text-ink-2 py-1">None yet.</p>
        ) : (
          verified.map((j) => <Row key={j.id} j={j} count={counts.get(j.id) ?? 0} />)
        )}
      </Card>

      <Card className="p-[22px] mt-4">
        <h2 className="text-[17px] tracking-[-0.3px] mb-1">
          Started, not verified{" "}
          <span className="text-ink-3 font-normal text-[14px]">({pending.length})</span>
        </h2>
        <p className="text-[12.5px] text-ink-2 mb-2">
          Listings here show a “compliance review pending” badge, and no
          commercial advertiser is offered a placement until the box is ticked.
        </p>
        {pending.length === 0 ? (
          <p className="text-[13.5px] text-ink-2 py-1">Nothing half-finished.</p>
        ) : (
          pending.map((j) => <Row key={j.id} j={j} count={counts.get(j.id) ?? 0} />)
        )}
      </Card>

      {fallback && (
        <Card className="p-[22px] mt-4">
          <h2 className="text-[17px] tracking-[-0.3px] mb-1">Everywhere else</h2>
          <p className="text-[12.5px] text-ink-2 mb-2">
            What an address in an unlisted city falls back to: {fallback.rules.max_sign_sqft} sq
            ft, {fallback.rules.max_height_ft} ft tall, noncommercial only.
          </p>
          <Row j={fallback} count={counts.get(fallback.id) ?? 0} />
        </Card>
      )}
    </div>
  );
}

function Row({ j, count }: { j: Jurisdiction; count: number }) {
  return (
    <div className="flex justify-between items-center gap-3 flex-wrap py-2.5 border-t border-hairline first:border-t-0">
      <span className="min-w-0">
        <b className="block text-[14.5px]">
          {j.name}, {j.state}
        </b>
        <span className="text-[12.5px] text-ink-2">
          {j.rules.max_sign_sqft} sq ft · {j.rules.max_height_ft} ft tall
          {j.rules.display_period_days ? ` · ${j.rules.display_period_days}-day displays` : ""}
          {j.rules.commercial_offpremise_allowed
            ? " · commercial allowed"
            : j.rules.weekend_corner?.allowed
              ? " · weekend corner"
              : j.rules.nonprofit_exempt
                ? " · nonprofit lane"
                : " · noncommercial only"}
        </span>
      </span>
      <span className="flex items-center gap-2.5 shrink-0">
        <span className="text-[12px] text-ink-3">
          {count} {count === 1 ? "yard" : "yards"}
        </span>
        <Badge tone={j.is_verified ? "brand" : "gold"}>
          {j.is_verified ? `${j.citations.length} sources` : "unverified"}
        </Badge>
        <Link
          href={`/admin/jurisdictions/${j.id}`}
          className="text-[12.5px] font-semibold text-brand-deep underline underline-offset-2"
        >
          edit
        </Link>
      </span>
    </div>
  );
}
