import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { Listing, PlacementRequest, RequestStatus } from "@/lib/supabase/types";
import { ELECTION_WINDOW_MONTHS } from "@/lib/booking";
import { money } from "@/lib/money";
import { describeTerm } from "@/lib/scheduling";
import { DecisionButtons } from "./DecisionButtons";

export const metadata: Metadata = { title: "Your requests — Yardtize" };

const fmt = (n: number) => n.toLocaleString("en-US");


const STATUS_COPY: Record<RequestStatus, { label: string; blurb: string }> = {
  requested: { label: "Awaiting you", blurb: "Review the design and decide." },
  approved: { label: "Approved", blurb: "Mark it live once the sign is in the ground." },
  active: { label: "Live", blurb: "The sign is up." },
  declined: { label: "Declined", blurb: "You turned this one down." },
  completed: { label: "Finished", blurb: "The placement has ended." },
};

const ADVERTISER_LABEL = {
  business: "Business",
  campaign: "Campaign",
  nonprofit: "Nonprofit",
} as const;

export default async function InboxPage() {
  const session = await getSessionProfile();
  if (!session?.user) redirect("/sign-in?next=/inbox");
  if (!session.profile?.role) redirect("/welcome?next=/inbox");

  const supabase = await createClient();

  const { data: listingRows } = await supabase
    .from("listings")
    .select("*")
    .eq("owner_id", session.user.id);
  const listings = (listingRows ?? []) as Listing[];
  const byId = new Map(listings.map((l) => [l.id, l]));

  // Row-level security already limits this to requests on yards we own; the
  // explicit filter keeps the query cheap when an owner has many listings.
  const { data: requestRows } = listings.length
    ? await supabase
        .from("requests")
        .select("*")
        .in("listing_id", [...byId.keys()])
        .order("created_at", { ascending: false })
    : { data: [] };
  const requests = (requestRows ?? []) as PlacementRequest[];

  // Signed links for the private artwork, valid for an hour.
  const previews = new Map<string, string>();
  for (const r of requests) {
    if (!r.rendering_path) continue;
    const { data } = await supabase.storage
      .from("sign-renderings")
      .createSignedUrl(r.rendering_path, 3600);
    if (data?.signedUrl) previews.set(r.id, data.signedUrl);
  }

  const waiting = requests.filter((r) => r.status === "requested").length;

  return (
    <div className="max-w-[860px] mx-auto px-[26px] py-[60px]">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h1 className="text-[26px] tracking-[-0.4px]">Placement requests</h1>
        {waiting > 0 && <Badge tone="gold">{waiting} awaiting you</Badge>}
      </div>
      <p className="text-ink-2 mb-6">
        You approve every advertiser before a sign goes in the ground.
      </p>

      {listings.length === 0 ? (
        <Card className="p-[42px] text-center">
          <h2 className="text-[19px]">No yards listed yet</h2>
          <p className="text-ink-2 mt-2.5 mb-5 max-w-[44ch] mx-auto">
            List a yard and businesses and campaigns can start requesting it.
          </p>
          <ButtonLink href="/list/new">List your yard →</ButtonLink>
        </Card>
      ) : requests.length === 0 ? (
        <Card className="p-[42px] text-center">
          <h2 className="text-[19px]">No requests yet</h2>
          <p className="text-ink-2 mt-2.5 max-w-[46ch] mx-auto">
            Your {listings.length === 1 ? "listing is" : "listings are"} live. We&rsquo;ll
            show requests here the moment a business or campaign asks for your corner.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3.5">
          {requests.map((r) => {
            const listing = byId.get(r.listing_id);
            const months = r.is_election_window ? ELECTION_WINDOW_MONTHS : (r.duration_months ?? 1);
            const gross = (listing?.monthly_rate ?? 0) * months;
            const status = STATUS_COPY[r.status];
            const preview = previews.get(r.id);

            return (
              <Card key={r.id} className="p-[22px]">
                <div className="flex justify-between items-start gap-3 flex-wrap mb-3">
                  <div>
                    <h2 className="text-[17px] tracking-[-0.2px]">{r.advertiser_name}</h2>
                    <p className="text-[12.5px] text-ink-3 mt-0.5">
                      {ADVERTISER_LABEL[r.advertiser_type]} · wants{" "}
                      {listing?.headline ?? "your yard"}
                    </p>
                  </div>
                  <Badge tone={r.status === "requested" ? "gold" : "brand"}>{status.label}</Badge>
                </div>

                <div className="grid sm:grid-cols-3 gap-2.5 mb-3.5">
                  <Fact label="Sign" value={r.sign_size_label.split("—")[0].trim()} sub={`${r.sign_size_sqft} sq ft`} />
                  <Fact
                    label="Sign is up"
                    value={describeTerm({ startsOn: r.starts_on, endsOn: r.ends_on })}
                    sub={
                      r.is_election_window
                        ? "Election window"
                        : `${r.duration_months} month${r.duration_months === 1 ? "" : "s"}`
                    }
                  />
                  <Fact
                    label="You'd earn"
                    value={money(gross)}
                    sub={listing?.monthly_rate ? `${money(listing.monthly_rate)}/mo` : "—"}
                  />
                </div>

                <div className="text-[13.5px] text-ink-2 mb-3">
                  <b className="text-ink">Install:</b>{" "}
                  {r.install === "self"
                    ? "the advertiser installs and removes it, with a $500 refundable deposit"
                    : "Yardtize's crew installs and removes it"}
                  {listing?.aadt_sum != null && (
                    <>
                      {" · "}
                      <b className="text-ink">{fmt(listing.aadt_sum)}</b> vehicles/day
                      {listing.traffic_source ? ` (${listing.traffic_source})` : ""}
                    </>
                  )}
                </div>

                {r.message && (
                  <p className="text-[13.5px] text-ink-2 bg-brand-wash rounded-[10px] px-3.5 py-2.5 mb-3">
                    “{r.message}”
                  </p>
                )}

                <div className="mb-3.5">
                  <span className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
                    Their sign design
                  </span>
                  {preview ? (
                    <Link
                      href={preview}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block border border-hairline rounded-[10px] px-3.5 py-2.5 text-[13.5px] text-brand-deep bg-brand-wash hover:brightness-[0.98]"
                    >
                      📄 View the artwork they&rsquo;ll print →
                    </Link>
                  ) : (
                    <p className="text-[13px] text-ink-3">
                      No artwork attached. Ask for it before approving.
                    </p>
                  )}
                </div>

                <p className="text-[12.5px] text-ink-3 mb-3">{status.blurb}</p>
                <DecisionButtons requestId={r.id} status={r.status} />

                {/* Only worth offering once there is something agreed to print. */}
                {(r.status === "approved" || r.status === "active") && (
                  <Link
                    href={`/agreement/${r.id}`}
                    className="inline-block mt-3 text-[13px] font-semibold text-brand-deep underline underline-offset-2"
                  >
                    Placement summary to print and sign →
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-hairline rounded-[10px] px-3 py-2.5">
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div className="text-[15.5px] font-bold">{value}</div>
      <div className="text-[11.5px] text-ink-2">{sub}</div>
    </div>
  );
}
