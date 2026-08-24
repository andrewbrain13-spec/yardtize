import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLeaseTerms } from "@/lib/lease-server";
import { numberedClauses, leaseHeading, LEASE_DISCLAIMER, type LeaseTerms } from "@/lib/lease";
import { describeTerm } from "@/lib/scheduling";
import { formatCents } from "@/lib/billing";
import type { Lease, LeaseSignature } from "@/lib/supabase/types";
import { partyLabel } from "@/lib/signing";
import { PrintButton } from "./PrintButton";
import { SignedUpload } from "./SignedUpload";
import { SignPanel } from "./SignPanel";

export const metadata: Metadata = {
  title: "Placement agreement — Yardtize",
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString("en-US");

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/agreement/${id}`);

  /*
   * Row-level security limits this to the advertiser who sent the request and
   * the homeowner who owns the yard, so somebody else's placement simply comes
   * back empty — no separate permission check needed.
   */
  const { data: request } = await supabase
    .from("requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  const { data: leaseRow } = await supabase
    .from("leases")
    .select("*")
    .eq("request_id", id)
    .maybeSingle();
  const lease = leaseRow as Lease | null;

  /*
   * Before a homeowner approves there is no agreement yet, only a proposal.
   * The terms are computed live in that case so both sides can read what they
   * would be agreeing to; once the lease exists, everything renders from the
   * frozen snapshot instead.
   */
  const terms: LeaseTerms | null = lease?.terms ?? (await buildLeaseTerms(id));
  if (!terms) notFound();

  const admin = createAdminClient();
  const isOwner =
    admin != null &&
    (
      await admin
        .from("listings")
        .select("owner_id")
        .eq("id", request.listing_id)
        .maybeSingle()
    ).data?.owner_id === user.id;

  // The address is the homeowner's to give: theirs always, the advertiser's
  // once they have been approved, because that is when they need it.
  const addressVisible =
    isOwner || ["approved", "active", "completed"].includes(request.status);

  const { data: signatureRows } = lease
    ? await supabase.from("lease_signatures").select("*").eq("lease_id", lease.id)
    : { data: [] };
  const signatures = (signatureRows ?? []) as LeaseSignature[];
  const myParty = isOwner ? "owner" : "advertiser";
  const mine = signatures.find((sig) => sig.party === myParty);
  const theirs = signatures.find((sig) => sig.party !== myParty);

  let signedUrl: string | null = null;
  if (lease?.signed_path) {
    const { data } = await supabase.storage
      .from("signed-leases")
      .createSignedUrl(lease.signed_path, 3600);
    signedUrl = data?.signedUrl ?? null;
  }

  const clauses = numberedClauses(terms);

  return (
    <div className="max-w-[780px] mx-auto px-[26px] py-[52px] print:py-0 print:px-0 print:max-w-none">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5 print:hidden">
        <div>
          <h1 className="text-[26px] tracking-[-0.4px]">Placement agreement</h1>
          <p className="text-ink-2 mt-1.5 max-w-[54ch]">
            {lease
              ? "Read it, then sign below. Once both of you have, Yardtize confirms and the placement goes live."
              : "What the two of you would be agreeing to. It becomes signable once the homeowner approves."}
          </p>
        </div>
        <PrintButton />
      </div>

      {lease && (
        <StatusPanel
          lease={lease}
          signedUrl={signedUrl}
          userId={user.id}
          myParty={myParty}
          alreadySigned={Boolean(mine)}
          otherSigned={Boolean(theirs)}
        />
      )}

      {!lease && (
        <Card className="p-4 mb-4 border-amber-edge bg-amber-wash print:hidden">
          <p className="text-[13.5px]">
            <b>Not agreed yet.</b> The homeowner hasn&rsquo;t answered this
            request. Nothing below is binding, and the figures can still change
            until they do.
          </p>
        </Card>
      )}

      <Card className="p-[38px] print:border-0 print:shadow-none print:p-0">
        <header className="pb-4 mb-5 border-b border-hairline">
          <div className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.2px]">
            <span className="grid place-items-center w-6 h-6 rounded-md bg-brand-deep text-white text-[13px]">
              Y
            </span>
            Yardtize
          </div>
          <h2 className="text-[21px] tracking-[-0.4px] mt-3">
            Yard Sign Placement Licence
          </h2>
          <p className="text-[12.5px] text-ink-3 mt-1">{leaseHeading(terms)}</p>
        </header>

        <section className="mb-6 break-inside-avoid">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
            At a glance
          </h3>
          <Pair
            label="Property"
            value={addressVisible ? terms.premises.address : "Shared once the homeowner approves"}
            sub={`${terms.premises.city}, ${terms.premises.state} ${terms.premises.postalCode}`.trim()}
          />
          <Pair label="Sign" value={terms.sign.sizeLabel} sub={`${terms.sign.sqft} sq ft · one sign only`} />
          <Pair
            label="Term"
            value={describeTerm({ startsOn: terms.term.startsOn, endsOn: terms.term.endsOn })}
            sub="Up on the first date, down on the second."
          />
          <Pair
            label="Owner is paid"
            value={`${formatCents(terms.money.monthlyRateCents)} per month`}
            sub={`${formatCents(terms.money.ownerTotalCents)} across the term — their full listed rate`}
          />
          <Pair
            label="Advertiser pays"
            value={`${formatCents(terms.money.dueNowCents)} to begin`}
            sub={`${formatCents(terms.money.advertiserTotalCents)} across the term, fee included`}
          />
          {terms.premises.aadt != null && (
            <Pair
              label="Traffic"
              value={`${fmt(terms.premises.aadt)} vehicles per day`}
              sub={`${terms.premises.trafficSource ?? "State DOT"}${terms.premises.trafficYear ? ` ${terms.premises.trafficYear}` : ""} — the basis for the rate`}
            />
          )}
        </section>

        {clauses.map((clause) => (
          <section key={clause.heading} className="mb-6 break-inside-avoid">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
              {clause.heading}
            </h3>
            {clause.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="text-[13.5px] text-ink-2 mb-2 last:mb-0">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <div className="grid sm:grid-cols-2 gap-6 mt-8 pt-6 border-t border-hairline">
          <SignatureBlock
            role="Property owner"
            name={terms.owner.name || terms.owner.email}
            signature={signatures.find((sig) => sig.party === "owner")}
          />
          <SignatureBlock
            role="Advertiser"
            name={terms.advertiser.name}
            sub={terms.advertiser.contact || terms.advertiser.email}
            signature={signatures.find((sig) => sig.party === "advertiser")}
          />
        </div>

        <p className="text-[11.5px] text-ink-3 mt-8 pt-4 border-t border-hairline leading-relaxed">
          <b>{LEASE_DISCLAIMER}</b>
        </p>
      </Card>
    </div>
  );
}

function StatusPanel({
  lease,
  signedUrl,
  userId,
  myParty,
  alreadySigned,
  otherSigned,
}: {
  lease: Lease;
  signedUrl: string | null;
  userId: string;
  myParty: "owner" | "advertiser";
  alreadySigned: boolean;
  otherSigned: boolean;
}) {
  if (lease.status === "approved") {
    return (
      <Card className="p-[22px] mb-4 print:hidden">
        <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
          <h2 className="text-[17px] tracking-[-0.3px]">Signed and confirmed</h2>
          <Badge>Live</Badge>
        </div>
        <p className="text-[13.5px] text-ink-2">
          Yardtize has checked the signatures. The placement is live for the term
          below.
        </p>
        {signedUrl && (
          <Link
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2.5 text-[13px] font-semibold text-brand-deep underline underline-offset-2"
          >
            View the signed copy →
          </Link>
        )}
      </Card>
    );
  }

  if (lease.status === "submitted") {
    return (
      <Card className="p-[22px] mb-4 print:hidden">
        <h2 className="text-[17px] tracking-[-0.3px] mb-1.5">With Yardtize for review</h2>
        <p className="text-[13.5px] text-ink-2">
          The signed copy is in. Yardtize checks that both parties have signed
          and that it matches the terms below — usually the same day. Nothing
          goes in the ground until it&rsquo;s confirmed.
        </p>
        {signedUrl && (
          <Link
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2.5 text-[13px] font-semibold text-brand-deep underline underline-offset-2"
          >
            View what was sent →
          </Link>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-[22px] mb-4 print:hidden">
      <h2 className="text-[17px] tracking-[-0.3px] mb-1.5">
        {lease.status === "rejected"
          ? "Sent back"
          : alreadySigned
            ? "You've signed"
            : "Ready to sign"}
      </h2>

      {lease.status === "rejected" && lease.review_note && (
        <p className="text-[13.5px] text-amber bg-amber-wash border border-amber-edge rounded-[10px] px-3.5 py-2.5 mb-3">
          {lease.review_note}
        </p>
      )}

      {alreadySigned ? (
        <p className="text-[13.5px] text-ink-2">
          {otherSigned
            ? "Both parties have signed. Yardtize is checking it now."
            : "Waiting on the other party. We'll email you the moment they sign, and the placement goes live once Yardtize confirms."}
        </p>
      ) : (
        <>
          <p className="text-[13.5px] text-ink-2 mb-3.5">
            Read the agreement below, then sign it here.
            {otherSigned ? " The other party has already signed." : ""}
          </p>
          <SignPanel
            leaseId={lease.id}
            partyLabel={partyLabel[myParty]}
            otherSigned={otherSigned}
          />
        </>
      )}

      {/* The paper route stays open for anyone who would rather use it. */}
      <details className="mt-4 border-t border-hairline pt-3">
        <summary className="cursor-pointer text-[12.5px] text-ink-2">
          Rather sign on paper?
        </summary>
        <ol className="text-[13px] text-ink-2 list-decimal pl-5 flex flex-col gap-1 my-3">
          <li>Print the agreement below, or save it as a PDF.</li>
          <li>Both of you sign it, however you like.</li>
          <li>Send the signed copy back here — a photo of the pages is fine.</li>
        </ol>
        <SignedUpload leaseId={lease.id} userId={userId} />
      </details>
    </Card>
  );
}

function Pair({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-hairline last:border-b-0">
      <div className="w-[130px] shrink-0 text-[12.5px] text-ink-3 pt-[2px]">{label}</div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink break-words">{value}</div>
        {sub && <div className="text-[12.5px] text-ink-2 break-words">{sub}</div>}
      </div>
    </div>
  );
}

function SignatureBlock({
  role,
  name,
  sub,
  signature,
}: {
  role: string;
  name: string;
  sub?: string;
  signature?: LeaseSignature;
}) {
  /*
   * A signed block shows what was actually signed — the name as typed, the
   * drawn mark if there was one, and the moment. An unsigned one keeps the
   * ruled lines, because this page is still printable for anyone who would
   * rather do it on paper.
   */
  if (signature) {
    return (
      <div className="break-inside-avoid">
        <div className="h-[38px] flex items-end gap-3">
          {signature.drawn_mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signature.drawn_mark}
              alt={`Signature of ${signature.typed_name}`}
              className="max-h-[38px] w-auto"
            />
          ) : (
            <span className="text-[19px] italic text-ink" style={{ fontFamily: "Georgia, serif" }}>
              {signature.typed_name}
            </span>
          )}
        </div>
        <div className="border-b border-ink-3" />
        <div className="text-[12.5px] text-ink-2 mt-1.5">{role}</div>
        <div className="text-[13.5px] font-semibold">{signature.typed_name}</div>
        {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
        <div className="text-[12px] text-ink-3 mt-3">
          Signed electronically{" "}
          {new Date(signature.signed_at).toLocaleString("en-US", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="break-inside-avoid">
      <div className="h-[38px] border-b border-ink-3" />
      <div className="text-[12.5px] text-ink-2 mt-1.5">{role}</div>
      <div className="text-[13.5px] font-semibold">{name || " "}</div>
      {sub && <div className="text-[12px] text-ink-3">{sub}</div>}
      <div className="mt-4 h-[26px] border-b border-ink-3 w-[140px]" />
      <div className="text-[12.5px] text-ink-2 mt-1.5">Date</div>
    </div>
  );
}
