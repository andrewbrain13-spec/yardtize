import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDelivery } from "@/lib/delivery";
import { planBilling, formatCents } from "@/lib/billing";
import { describeTerm, describeDay } from "@/lib/scheduling";
import { VISIBILITY_FACTOR } from "@/lib/rate";
import type { Charge, Listing, PlacementEvent, PlacementRequest } from "@/lib/supabase/types";
import { paymentsEnabled, inTestMode } from "@/lib/stripe";
import { Lifecycle } from "./Lifecycle";

export const metadata: Metadata = {
  title: "Placement report — Yardtize",
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString("en-US");

const CHARGE_LABEL: Record<Charge["kind"], string> = {
  placement: "Placement",
  deposit: "Refundable deposit",
  install: "Install and removal",
};

const EVENT_LABEL: Record<PlacementEvent["kind"], string> = {
  installed: "Sign went up",
  takedown_requested: "Takedown requested",
  removed: "Sign came down",
  note: "Note",
};

/**
 * What the advertiser bought, and what has been delivered so far.
 *
 * Everything on this page comes from the state's traffic count and the days
 * the sign has stood — the same two inputs the price came from. An advertiser
 * can check the arithmetic against the listing they booked, which is the whole
 * argument for pricing on public data in the first place.
 */
export default async function PlacementReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/placements/${id}`);

  // Row-level security limits this to the two parties.
  const { data: requestRow } = await supabase
    .from("requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!requestRow) notFound();
  const request = requestRow as PlacementRequest;

  const admin = createAdminClient();
  const { data: listingRow } = admin
    ? await admin.from("listings").select("*").eq("id", request.listing_id).maybeSingle()
    : { data: null };
  if (!listingRow) notFound();
  const listing = listingRow as Listing;

  const isOwner = listing.owner_id === user.id;

  const plan = planBilling({
    monthlyRateDollars: listing.monthly_rate ?? 0,
    startsOn: request.starts_on,
    endsOn: request.ends_on,
    install: request.install,
  });

  const delivery = computeDelivery({
    aadt: listing.aadt_sum,
    startsOn: request.starts_on,
    endsOn: request.ends_on,
    // The placement itself, not the deposit — a refundable hold is not a media spend.
    paidCents: plan.totalCents - plan.refundableCents,
  });

  const live = request.status === "active";

  const { data: eventRows } = await supabase
    .from("placement_events")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });
  const events = (eventRows ?? []) as PlacementEvent[];

  /*
   * The schedule as written at countersigning, not recomputed. Once anything
   * has been charged, the amount taken is the amount owed — recomputing would
   * let a later rate change rewrite history.
   */
  const { data: chargeRows } = await supabase
    .from("charges")
    .select("*")
    .eq("request_id", id)
    .order("due_on");
  const charges = (chargeRows ?? []) as Charge[];

  // Signed links for the photographs, an hour each.
  const photos = new Map<string, string>();
  for (const event of events) {
    if (!event.photo_path) continue;
    const { data } = await supabase.storage
      .from("placement-photos")
      .createSignedUrl(event.photo_path, 3600);
    if (data?.signedUrl) photos.set(event.id, data.signedUrl);
  }

  return (
    <div className="max-w-[820px] mx-auto px-[26px] py-[52px]">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h1 className="text-[26px] tracking-[-0.4px]">
          {listing.headline ?? `${listing.city} placement`}
        </h1>
        <Badge tone={live ? "brand" : "gold"}>
          {live ? "Live" : request.status}
        </Badge>
      </div>
      <p className="text-ink-2 mb-6">
        {describeTerm({ startsOn: request.starts_on, endsOn: request.ends_on })} ·{" "}
        {listing.city}, {listing.state}
        {isOwner ? " · your yard" : ` · ${request.advertiser_name}`}
      </p>

      {(live || request.status === "completed") && (
        <Lifecycle
          requestId={request.id}
          userId={user.id}
          installed={Boolean(request.installed_at)}
          takedownAt={request.takedown_requested_at}
          removed={Boolean(request.removed_at)}
          isOwner={isOwner}
        />
      )}

      {delivery.status === "not started" && (
        <Card className="p-4 mb-4">
          <p className="text-[13.5px]">
            The sign goes up {describeDay(request.starts_on)}. Delivery starts
            counting then.
          </p>
        </Card>
      )}

      <Card className="p-[26px]">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
          <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3">
            Delivered so far
          </h2>
          <span className="text-[12.5px] text-ink-2 tabular-nums">
            day {delivery.daysElapsed} of {delivery.daysTotal}
            {delivery.daysRemaining > 0 && ` · ${delivery.daysRemaining} to go`}
          </span>
        </div>

        <div className="text-[38px] font-bold tracking-[-1px] leading-none tabular-nums">
          {fmt(delivery.impressionsToDate)}
        </div>
        <p className="text-[13px] text-ink-2 mt-1.5">
          eye-level impressions, of {fmt(delivery.impressionsAtTermEnd)} across the
          full term
        </p>

        <div className="h-2 rounded-full bg-brand-wash-2 mt-4 overflow-hidden">
          <div
            className="h-full bg-brand rounded-full"
            style={{ width: `${Math.round(delivery.progress * 100)}%` }}
          />
        </div>
      </Card>

      <div className="grid sm:grid-cols-3 gap-3 mt-3">
        <Stat
          label="Traffic past this yard"
          value={listing.aadt_sum === null ? "No count" : `${fmt(listing.aadt_sum)}/day`}
          sub={
            listing.traffic_source
              ? `${listing.traffic_source}${listing.traffic_year ? ` ${listing.traffic_year}` : ""}`
              : "not published"
          }
        />
        <Stat
          label={isOwner ? "You earn" : "You're paying"}
          value={formatCents(
            isOwner ? plan.ownerTotalCents : plan.totalCents - plan.refundableCents,
          )}
          sub="across the term"
        />
        <Stat
          label="Cost per thousand"
          value={
            delivery.effectiveCpmCents === null
              ? "—"
              : formatCents(delivery.effectiveCpmCents)
          }
          sub={delivery.effectiveCpmCents === null ? "no traffic count" : "across the term"}
        />
      </div>

      <Card className="p-[22px] mt-4">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
          How this is counted
        </h2>
        <p className="text-[13.5px] text-ink-2 mb-2">
          {listing.aadt_sum === null ? (
            <>
              No state traffic count has been published for the roads this yard
              fronts, so no impressions are claimed. Yardtize doesn&rsquo;t
              estimate them.
            </>
          ) : (
            <>
              {fmt(listing.aadt_sum)} vehicles pass this yard on an average day,
              from {listing.traffic_source ?? "state DOT"} counts
              {listing.traffic_year ? ` for ${listing.traffic_year}` : ""}. Of those,{" "}
              {Math.round(VISIBILITY_FACTOR * 100)}% are credited as seeing the
              sign — a small sign at eye level earns a fraction of the traffic
              passing it, and the same fraction sets the price.
            </>
          )}
        </p>
        <p className="text-[12.5px] text-ink-3">
          These are modelled impressions, not measured ones. Nobody counts eyes
          on a yard sign; out-of-home advertising is priced on exactly this
          basis, and saying so is worth more than a number pretending to be
          precise.
        </p>
      </Card>

      {charges.length > 0 && (
        <Card className="p-[22px] mt-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2.5">
            <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3">
              {isOwner ? "What you're paid" : "What you're charged"}
            </h2>
            {!paymentsEnabled() ? (
              <span className="text-[12px] text-amber">not collected yet</span>
            ) : inTestMode() ? (
              <span className="text-[12px] text-amber">Stripe test mode</span>
            ) : null}
          </div>

          {charges.map((charge) => (
            <div
              key={charge.id}
              className="flex justify-between items-baseline gap-3 flex-wrap py-2 border-t border-hairline first:border-t-0"
            >
              <span className="min-w-0">
                <b className="block text-[13.5px]">{CHARGE_LABEL[charge.kind]}</b>
                <span className="text-[12px] text-ink-2">
                  {describeDay(charge.period_start)} – {describeDay(charge.period_end)}
                  {charge.kind === "deposit" &&
                    (isOwner
                      ? " · returned to them when the sign comes down clean"
                      : " · returned when the sign comes down")}
                </span>
              </span>
              <span className="text-right shrink-0">
                {/*
                  A deposit and the install fee pay the homeowner nothing, so
                  from their side these are not $0.00 payments — they are facts
                  about the placement. Showing a row of zeroes under "what
                  you're paid" reads like a mistake.
                */}
                {isOwner && charge.owner_cents === 0 ? (
                  <span className="text-[12.5px] text-ink-2">
                    {charge.kind === "deposit" ? "held against damage" : "Yardtize's cost"}
                  </span>
                ) : (
                  <>
                    <b className="block text-[14px] tabular-nums">
                      {formatCents(isOwner ? charge.owner_cents : charge.amount_cents)}
                    </b>
                    <span className="text-[11.5px] text-ink-3">
                      {charge.status === "paid" ? "paid" : `due ${describeDay(charge.due_on)}`}
                    </span>
                  </>
                )}
              </span>
            </div>
          ))}

          {!paymentsEnabled() && (
            <p className="text-[12.5px] text-ink-2 mt-3 pt-3 border-t border-hairline">
              Yardtize isn&rsquo;t collecting payment yet — this is the schedule
              both parties agreed to, and you settle it directly for now.
            </p>
          )}
        </Card>
      )}

      {events.length > 0 && (
        <Card className="p-[22px] mt-4">
          <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2.5">
            What happened
          </h2>
          {events.map((event) => (
            <div key={event.id} className="py-2.5 border-t border-hairline first:border-t-0">
              <div className="flex justify-between items-baseline gap-3 flex-wrap">
                <b className="text-[14px]">{EVENT_LABEL[event.kind]}</b>
                <span className="text-[12px] text-ink-3">
                  {new Date(event.created_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              {event.note && <p className="text-[13px] text-ink-2 mt-1">{event.note}</p>}
              {photos.get(event.id) && (
                <Link
                  href={photos.get(event.id)!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1.5 text-[12.5px] font-semibold text-brand-deep underline underline-offset-2"
                >
                  📷 See the photo →
                </Link>
              )}
            </div>
          ))}
        </Card>
      )}

      <div className="flex gap-4 flex-wrap mt-6 text-[13px]">
        <Link href={`/agreement/${request.id}`} className="font-semibold text-brand-deep underline underline-offset-2">
          The agreement →
        </Link>
        <Link href={isOwner ? "/inbox" : "/dashboard"} className="text-ink-3 underline underline-offset-2">
          Back to {isOwner ? "your requests" : "your account"}
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-[18px]">
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.4px] mt-0.5 tabular-nums">{value}</div>
      <div className="text-[11.5px] text-ink-2">{sub}</div>
    </Card>
  );
}
