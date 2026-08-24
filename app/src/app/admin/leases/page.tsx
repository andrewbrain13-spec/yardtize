import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { describeTerm } from "@/lib/scheduling";
import { formatCents } from "@/lib/billing";
import type { Lease } from "@/lib/supabase/types";
import { ReviewControl } from "./ReviewControl";

export const metadata: Metadata = {
  title: "Agreements — Yardtize",
  robots: { index: false, follow: false },
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * The countersigning desk.
 *
 * Yardtize is not a party to these agreements, but it is the only place both
 * sides meet — so it checks that a signed copy is actually signed by both, and
 * that it matches the terms that were generated, before a sign goes in the
 * ground. That check is the whole reason no e-signature vendor is needed yet.
 */
export default async function LeasesPage() {
  const { admin } = await requireAdmin("/admin/leases");
  if (!admin) return null;

  const { data } = await admin
    .from("leases")
    .select("*")
    .order("created_at", { ascending: false });
  const leases = (data ?? []) as Lease[];

  // Signed links for the private copies, an hour each.
  const links = new Map<string, string>();
  for (const lease of leases) {
    if (!lease.signed_path) continue;
    const { data: signed } = await admin.storage
      .from("signed-leases")
      .createSignedUrl(lease.signed_path, 3600);
    if (signed?.signedUrl) links.set(lease.id, signed.signedUrl);
  }

  const waiting = leases.filter((l) => l.status === "submitted");
  const rest = leases.filter((l) => l.status !== "submitted");

  return (
    <div className="max-w-[900px] mx-auto px-[26px] py-[52px]">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h1 className="text-[26px] tracking-[-0.4px]">Agreements</h1>
        {waiting.length > 0 && <Badge tone="gold">{waiting.length} waiting on you</Badge>}
      </div>
      <p className="text-ink-2 mt-1.5 mb-6 max-w-[60ch]">
        Check that both parties have signed and that the copy matches the terms.
        Confirming is what takes the placement live.
      </p>

      <Card className="p-[22px]">
        <h2 className="text-[17px] tracking-[-0.3px] mb-2">Waiting for you</h2>
        {waiting.length === 0 ? (
          <p className="text-[13.5px] text-ink-2 py-1">
            Nothing to check. A signed copy lands here the moment one is sent back.
          </p>
        ) : (
          waiting.map((lease) => (
            <Row key={lease.id} lease={lease} url={links.get(lease.id)} reviewable />
          ))
        )}
      </Card>

      {rest.length > 0 && (
        <Card className="p-[22px] mt-4">
          <h2 className="text-[17px] tracking-[-0.3px] mb-2">
            Everything else <span className="text-ink-3 font-normal text-[14px]">({rest.length})</span>
          </h2>
          {rest.map((lease) => (
            <Row key={lease.id} lease={lease} url={links.get(lease.id)} />
          ))}
        </Card>
      )}
    </div>
  );
}

const TONE = {
  awaiting_signature: "gold",
  submitted: "gold",
  approved: "brand",
  rejected: "gold",
} as const;

const LABEL = {
  awaiting_signature: "awaiting signature",
  submitted: "waiting on you",
  approved: "live",
  rejected: "sent back",
} as const;

function Row({ lease, url, reviewable }: { lease: Lease; url?: string; reviewable?: boolean }) {
  const t = lease.terms;

  return (
    <div className="py-3.5 border-t border-hairline first:border-t-0">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="min-w-0">
          <b className="block text-[14.5px]">
            {t.advertiser.name} · {t.premises.city}, {t.premises.state}
          </b>
          <span className="text-[12.5px] text-ink-2">
            {describeTerm({ startsOn: t.term.startsOn, endsOn: t.term.endsOn })} ·{" "}
            {formatCents(t.money.monthlyRateCents)}/mo to {t.owner.name || t.owner.email} ·
            ref {t.reference}
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[12px] text-ink-3">{when(lease.created_at)}</span>
          <Badge tone={TONE[lease.status]}>{LABEL[lease.status]}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap mt-2.5">
        {url && (
          <Link
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] font-semibold text-brand-deep underline underline-offset-2"
          >
            📄 Open the signed copy
          </Link>
        )}
        <Link
          href={`/agreement/${lease.request_id}`}
          className="text-[12.5px] text-ink-3 underline underline-offset-2"
        >
          the agreement itself
        </Link>
      </div>

      {reviewable && (
        <div className="mt-3">
          <ReviewControl leaseId={lease.id} />
        </div>
      )}

      {lease.status === "rejected" && lease.review_note && (
        <p className="text-[12.5px] text-ink-2 mt-2">Sent back: {lease.review_note}</p>
      )}
    </div>
  );
}
