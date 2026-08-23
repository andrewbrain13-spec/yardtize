import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/money";
import { ELECTION_WINDOW_MONTHS, SELF_INSTALL_DEPOSIT, PLATFORM_INSTALL_EACH_WAY } from "@/lib/booking";
import type { Jurisdiction } from "@/lib/supabase/types";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = {
  title: "Placement summary — Yardtize",
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
   * Row-level security on `requests` already limits reads to the advertiser
   * who sent it and the homeowner who owns the yard, so a stranger's request
   * simply comes back empty here — no separate permission check needed.
   */
  const { data: request } = await supabase
    .from("requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  /*
   * An advertiser cannot read the listing row until their request is approved
   * (migration 0006), so a pending summary has to come from the service-role
   * client — with the address held back below. The homeowner's own read
   * succeeds through the normal client either way.
   */
  const admin = createAdminClient();
  let listing = (
    await supabase.from("listings").select("*").eq("id", request.listing_id).maybeSingle()
  ).data;
  if (!listing && admin) {
    listing = (
      await admin.from("listings").select("*").eq("id", request.listing_id).maybeSingle()
    ).data;
  }
  if (!listing) notFound();

  // The address is the homeowner's to give. They always see it; the advertiser
  // sees it once they have been approved, because that is when they need it.
  const addressVisible =
    listing.owner_id === user.id ||
    request.status === "approved" ||
    request.status === "active" ||
    request.status === "completed";

  let jurisdiction: Jurisdiction | null = null;
  if (listing.jurisdiction_id) {
    const { data } = await supabase
      .from("jurisdictions")
      .select("*")
      .eq("id", listing.jurisdiction_id)
      .maybeSingle();
    jurisdiction = data;
  }

  /*
   * Each party may read only their own profile, so the counterparty's name and
   * email come from the service-role client. Both are already known to each
   * other by this point — the whole document exists to be signed by the two of
   * them — but the database is right not to hand them over by default.
   */
  const [owner, advertiser] = admin
    ? await Promise.all([
        admin.from("profiles").select("email, full_name").eq("id", listing.owner_id).maybeSingle(),
        admin.from("profiles").select("email, full_name").eq("id", request.requester_id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const months = request.is_election_window ? ELECTION_WINDOW_MONTHS : (request.duration_months ?? 1);
  const total = (listing.monthly_rate ?? 0) * months;
  const rules = jurisdiction?.rules;

  const termLine = request.is_election_window
    ? "The 2026 election window — September 19 through November 5, 2026."
    : `${request.duration_months} month${request.duration_months === 1 ? "" : "s"}, beginning on the installation date written in below.`;

  return (
    <div className="max-w-[780px] mx-auto px-[26px] py-[52px] print:py-0 print:px-0 print:max-w-none">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5 print:hidden">
        <div>
          <h1 className="text-[26px] tracking-[-0.4px]">Placement summary</h1>
          <p className="text-ink-2 mt-1.5 max-w-[54ch]">
            Everything the two of you agreed to, on one page. Print it, both
            sign it, and each keep a copy.
          </p>
        </div>
        <PrintButton />
      </div>

      {request.status === "requested" && (
        <Card className="p-4 mb-4 border-amber-edge bg-amber-wash print:hidden">
          <p className="text-[13.5px]">
            <b>Not agreed yet.</b> The homeowner hasn&rsquo;t answered this request.
            Nothing below is binding until they approve it and both parties sign.
          </p>
        </Card>
      )}
      {request.status === "declined" && (
        <Card className="p-4 mb-4 print:hidden">
          <p className="text-[13.5px]">
            <b>Declined.</b> The homeowner turned this request down. This page is
            kept for reference only.
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
          <h2 className="text-[21px] tracking-[-0.4px] mt-3">Yard Sign Placement Agreement</h2>
          <p className="text-[12.5px] text-ink-3 mt-1">
            Reference {request.id.slice(0, 8).toUpperCase()} · prepared{" "}
            {new Date().toLocaleDateString("en-US", { dateStyle: "long" })}
          </p>
        </header>

        <Section title="1. Parties">
          {/* A name is worth more than an email on a document meant to be signed,
              but nobody is blocked from printing one for want of it. */}
          <Pair
            label="Property owner"
            value={owner.data?.full_name || (owner.data?.email ?? "—")}
            sub={
              owner.data?.full_name
                ? (owner.data.email ?? "")
                : "Name to be written in at signing"
            }
          />
          <Pair
            label="Advertiser"
            value={request.advertiser_name}
            sub={[advertiser.data?.full_name, advertiser.data?.email].filter(Boolean).join(" · ")}
          />
          <p className="text-[12.5px] text-ink-2 mt-2">
            Yardtize is not a party to this agreement. Yardtize introduced the
            parties, priced the placement from public traffic data, and screened
            it against the local sign code.
          </p>
        </Section>

        <Section title="2. The property and the sign">
          <Pair
            label="Address"
            value={addressVisible ? listing.street_address : "Shared once the homeowner approves"}
            sub={`${listing.city}, ${listing.state} ${listing.postal_code ?? ""}`}
          />
          <Pair label="Sign" value={request.sign_size_label} sub={`${request.sign_size_sqft} sq ft of face area · one sign only`} />
          {addressVisible && listing.sign_lat != null && listing.sign_lng != null && (
            <Pair
              label="Placement"
              value={`${listing.sign_lat.toFixed(5)}, ${listing.sign_lng.toFixed(5)}`}
              sub="The pin the owner set, to be honored within a few feet."
            />
          )}
          {listing.aadt_sum != null && (
            <Pair
              label="Traffic"
              value={`${fmt(listing.aadt_sum)} vehicles per day`}
              sub={`${listing.traffic_source ?? "State DOT"}${listing.traffic_year ? ` ${listing.traffic_year}` : ""} · the basis for the rate below`}
            />
          )}
        </Section>

        <Section title="3. Term and rate">
          <Pair label="Term" value={termLine} sub="" />
          <Pair label="Rate" value={`${money(listing.monthly_rate)} per month`} sub={`${money(total)} over the full term`} />
          <p className="text-[12.5px] text-ink-2 mt-2">
            Yardtize is not collecting payment at this stage of the pilot. The
            advertiser pays the property owner directly, on whatever schedule
            the two of you write in below.
          </p>
          <div className="mt-3 border border-hairline rounded-[10px] px-3.5 py-3">
            <div className="text-[11.5px] text-ink-3 font-medium mb-1">Payment schedule agreed between the parties</div>
            <div className="h-[26px] border-b border-dashed border-edge" />
          </div>
        </Section>

        <Section title="4. Installation and removal">
          {request.install === "self" ? (
            <p className="text-[13.5px] text-ink-2">
              The advertiser installs and removes the sign at their own cost and
              risk, and holds a{" "}
              <b className="text-ink">{money(SELF_INSTALL_DEPOSIT)} refundable deposit</b>{" "}
              with the property owner against damage to the yard. The deposit is
              returned within 14 days of removal if the ground is left as found.
            </p>
          ) : (
            <p className="text-[13.5px] text-ink-2">
              Yardtize installs and removes the sign at{" "}
              <b className="text-ink">{money(PLATFORM_INSTALL_EACH_WAY)} each way</b>,
              billed to the advertiser.
            </p>
          )}
          <p className="text-[13.5px] text-ink-2 mt-2">
            The sign is removed and the ground restored within 7 days of the end
            of the term. Utility locates are the responsibility of whoever puts
            the stakes in the ground.
          </p>
        </Section>

        <Section title="5. Local sign rules">
          {jurisdiction && rules ? (
            <>
              <p className="text-[13.5px] text-ink-2">
                This placement was screened against{" "}
                <b className="text-ink">{jurisdiction.name}</b>&rsquo;s sign code
                {jurisdiction.is_verified ? "" : ", which Yardtize has not yet verified line by line"}.
                As written there: signs up to {rules.max_sign_sqft} sq ft and{" "}
                {rules.max_height_ft} ft tall
                {rules.setback_ft ? `, set back at least ${rules.setback_ft} ft from the right-of-way` : ""}
                {rules.display_period_days
                  ? `, displayed up to ${rules.display_period_days} days at a time${rules.gap_days ? ` with a ${rules.gap_days}-day gap after` : ""}`
                  : ""}
                .
              </p>
              {jurisdiction.citations.length > 0 && (
                <p className="text-[11.5px] text-ink-3 mt-2 break-words">
                  {jurisdiction.citations.join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13.5px] text-ink-2">
              Yardtize has not verified this city&rsquo;s sign code. Both parties
              should confirm the local limits before installing.
            </p>
          )}
          <p className="text-[13.5px] text-ink-2 mt-2">
            Sign codes change, and enforcement can reach both the advertiser and
            the property owner. Neither party is relying on Yardtize for legal
            advice.
          </p>
        </Section>

        <Section title="6. Takedown">
          <p className="text-[13.5px] text-ink-2">
            If the city, an HOA, or the property owner objects to the sign for
            any reason, it comes down within{" "}
            <b className="text-ink">48 hours</b> of notice, and the rate is
            prorated to the removal date. Neither party owes the other anything
            further for a takedown made in good faith.
          </p>
        </Section>

        <Section title="7. Content">
          <p className="text-[13.5px] text-ink-2">
            The advertiser is responsible for what the sign says and owns or has
            licensed the artwork on it. The property owner is not endorsing the
            advertiser&rsquo;s message by hosting it. The artwork approved
            through Yardtize is the artwork that gets printed; a materially
            different design requires the owner&rsquo;s consent.
          </p>
        </Section>

        <div className="grid sm:grid-cols-2 gap-6 mt-8 pt-6 border-t border-hairline">
          <SignatureBlock role="Property owner" name={owner.data?.full_name ?? ""} />
          <SignatureBlock role="Advertiser" name={request.advertiser_name} />
        </div>

        <p className="text-[11.5px] text-ink-3 mt-8 pt-4 border-t border-hairline leading-relaxed">
          <b>This is a plain-language summary, not legal advice.</b> Yardtize
          generated it from what both parties selected. Neither party has had it
          reviewed by counsel on the other&rsquo;s behalf, and Yardtize is not a
          party to it. Have a Missouri or Kansas attorney review it before you
          rely on it.
        </p>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Pair({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-hairline last:border-b-0">
      <div className="w-[120px] shrink-0 text-[12.5px] text-ink-3 pt-[2px]">{label}</div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink break-words">{value}</div>
        {sub && <div className="text-[12.5px] text-ink-2 break-words">{sub}</div>}
      </div>
    </div>
  );
}

function SignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="break-inside-avoid">
      <div className="h-[38px] border-b border-ink-3" />
      <div className="text-[12.5px] text-ink-2 mt-1.5">{role}</div>
      <div className="text-[13.5px] font-semibold">{name || " "}</div>
      <div className="mt-4 h-[26px] border-b border-ink-3 w-[140px]" />
      <div className="text-[12.5px] text-ink-2 mt-1.5">Date</div>
    </div>
  );
}
