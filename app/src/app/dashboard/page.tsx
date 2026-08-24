import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ButtonLink, Badge, Card } from "@/components/ui";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { ELECTION_WINDOW_MONTHS } from "@/lib/booking";
import { describeTerm } from "@/lib/scheduling";
import { computeDelivery } from "@/lib/delivery";

const fmtImpressions = (n: number) => n.toLocaleString("en-US");
import type { PlacementRequest, PublicListing, RequestStatus } from "@/lib/supabase/types";
import { NameField } from "./NameField";

/*
 * The advertiser's half of the status flow. The homeowner sees the same five
 * states from the other side in /inbox, worded for the person deciding rather
 * than the person waiting.
 */
const ADVERTISER_STATUS: Record<RequestStatus, string> = {
  requested: "Waiting on the homeowner",
  approved: "Approved — arrange your install",
  active: "Sign is up",
  declined: "Declined",
  completed: "Finished",
};

export const metadata: Metadata = { title: "Your account — Yardtize" };

export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session?.user) redirect("/sign-in?next=/dashboard");
  if (!session.profile?.role) redirect("/welcome");

  const isHomeowner = session.profile.role === "homeowner";

  /*
   * An advertiser had no way to see what they had asked for — the only signal
   * was an email. Listings come from the public view because a request that is
   * still pending carries no right to read the yard's row.
   */
  let requests: PlacementRequest[] = [];
  let listings = new Map<string, PublicListing>();
  if (!isHomeowner) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("requests")
      .select("*")
      .eq("requester_id", session.user.id)
      .order("created_at", { ascending: false });
    requests = (data ?? []) as PlacementRequest[];

    const ids = [...new Set(requests.map((r) => r.listing_id))];
    if (ids.length) {
      const { data: rows } = await supabase
        .from("listings_public")
        .select("*")
        .in("id", ids);
      listings = new Map(((rows ?? []) as PublicListing[]).map((l) => [l.id, l]));
    }
  }

  return (
    <div className="max-w-[720px] mx-auto px-[26px] py-[70px]">
      <Card className="p-[42px]">
        <div className="flex items-center gap-2.5 flex-wrap mb-4">
          <h1 className="text-[26px] tracking-[-0.4px]">Your account</h1>
          <Badge>{isHomeowner ? "Homeowner" : "Business"}</Badge>
        </div>
        <p className="text-ink-2 mb-1">
          Signed in as <b className="text-ink">{session.user.email}</b>.
        </p>
        <p className="text-ink-2 mb-7">
          {isHomeowner
            ? "List a yard, then approve or decline the businesses and campaigns that ask for it."
            : "Browse yards ranked by the traffic that passes them, and request the corners that fit your campaign."}
        </p>

        <NameField current={session.profile.full_name} />

        <div className="flex gap-3 flex-wrap">
          <ButtonLink href={isHomeowner ? "/list" : "/browse"}>
            {isHomeowner ? "List your yard" : "Browse yards"}
          </ButtonLink>
          {isHomeowner && (
            <ButtonLink href="/inbox" variant="ghost">
              Placement requests
            </ButtonLink>
          )}
          {/* The only link to /admin anywhere; the page itself 404s for everyone else. */}
          {session.profile.is_admin && (
            <ButtonLink href="/admin" variant="ghost">
              Operations
            </ButtonLink>
          )}
          <form action="/auth/signout" method="post">
            <button type="submit" className="px-[17px] py-2.5 rounded-[11px] text-[15px] font-semibold border border-edge text-ink hover:brightness-[1.06]">
              Sign out
            </button>
          </form>
        </div>
      </Card>

      {!isHomeowner && requests.length > 0 && (
        <Card className="p-[26px] mt-5">
          <h2 className="text-[18px] tracking-[-0.3px] mb-1">Your requests</h2>
          <p className="text-[13px] text-ink-2 mb-3">
            Homeowners decide on their own time. We email you either way.
          </p>
          {requests.map((r) => {
            const listing = listings.get(r.listing_id);
            const months = r.is_election_window
              ? ELECTION_WINDOW_MONTHS
              : (r.duration_months ?? 1);

            return (
              <div
                key={r.id}
                className="py-3.5 border-t border-hairline first:border-t-0"
              >
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="min-w-0">
                    <b className="block text-[14.5px]">
                      {listing?.headline ?? "A yard that is no longer listed"}
                    </b>
                    <span className="text-[12.5px] text-ink-2">
                      {r.sign_size_label.split("—")[0].trim()} ·{" "}
                      {describeTerm({ startsOn: r.starts_on, endsOn: r.ends_on })}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <b className="block text-[15px]">
                      {money((listing?.monthly_rate ?? 0) * months)}
                    </b>
                    <span className="text-[11.5px] text-ink-3">over the term</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap mt-2">
                  <Badge tone={r.status === "requested" ? "gold" : "brand"}>
                    {ADVERTISER_STATUS[r.status]}
                  </Badge>
                  {/* A report only says something once the sign is standing. */}
                  {(r.status === "active" || r.status === "completed") && (
                    <Link
                      href={`/placements/${r.id}`}
                      className="text-[12.5px] font-semibold text-brand-deep underline underline-offset-2"
                    >
                      {fmtImpressions(
                        computeDelivery({
                          aadt: listing?.aadt_sum ?? null,
                          startsOn: r.starts_on,
                          endsOn: r.ends_on,
                          paidCents: 0,
                        }).impressionsToDate,
                      )}{" "}
                      impressions →
                    </Link>
                  )}
                  <Link
                    href={`/agreement/${r.id}`}
                    className="text-[12.5px] text-ink-3 underline underline-offset-2"
                  >
                    agreement
                  </Link>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
