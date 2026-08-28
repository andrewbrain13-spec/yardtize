"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { WaitlistForm } from "@/components/WaitlistForm";
import {
  checkAvailability,
  describeDay,
  describeTerm,
  termFor,
  today,
} from "@/lib/scheduling";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/money";
import type { AdvertiserType } from "@/lib/supabase/types";
import { ListingsMap } from "./ListingsMap";
import { submitRequest, type RequestState } from "./actions";
import { ELECTION_WINDOW_MONTHS, SELF_INSTALL_DEPOSIT, PLATFORM_INSTALL_EACH_WAY } from "@/lib/booking";
import { planBilling, formatCents } from "@/lib/billing";

type Fit = { allowed: boolean; product?: string; reason: string };

export type PortalListing = {
  id: string;
  headline: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  aadt: number | null;
  trafficSource: string | null;
  trafficYear: number | null;
  segments: Array<{ road: string; aadt: number; source: string; year: number }>;
  rate: number | null;
  signalized: boolean;
  cornerLot: boolean;
  isDemo: boolean;
  /** Terms already approved on this yard — dates only, no advertiser. */
  booked: Array<{ startsOn: string; endsOn: string }>;
  /** Soonest day a new placement could begin, gap rules included. */
  availableFrom: string;
  displayPeriodDays: number | null;
  gapDays: number | null;
  jurisdictionName: string;
  complianceChecks: Array<{ status: "pass" | "info" | "warn"; label: string }>;
  sizes: Array<{ label: string; sqft: number }>;
  fits: Record<AdvertiserType, Fit>;
};

const fmt = (n: number) => n.toLocaleString("en-US");


const ADVERTISERS: Array<{ value: AdvertiserType; label: string; hint: string }> = [
  { value: "business", label: "Business", hint: "A for-profit company" },
  { value: "campaign", label: "Campaign", hint: "Candidate, ballot issue or advocacy" },
  { value: "nonprofit", label: "Nonprofit", hint: "Charity, church, school or community group" },
];

const DURATIONS = [
  { value: "1", label: "1 month", months: 1 },
  { value: "3", label: "3 months", months: 3 },
  { value: "6", label: "6 months", months: 6 },
  { value: "12", label: "12 months", months: 12 },
  { value: "election", label: "Election window · Sep 19 – Nov 5", months: ELECTION_WINDOW_MONTHS },
];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "signalized", label: "Signalized" },
  { id: "corner", label: "Corner lots" },
  { id: "campaign", label: "Open to campaigns" },
  { id: "under250", label: "Under $250" },
] as const;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${buttonClass("primary", "big")} w-full mt-2.5 disabled:opacity-50`}
    >
      {pending ? "Sending…" : "Send request to owner →"}
    </button>
  );
}

export function Portal({
  listings,
  mapsApiKey,
  userId,
}: {
  listings: PortalListing[];
  mapsApiKey: string | null;
  userId: string | null;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      listings.filter((l) => {
        if (filter === "signalized") return l.signalized;
        if (filter === "corner") return l.cornerLot;
        if (filter === "campaign") return l.fits.campaign.allowed;
        if (filter === "under250") return (l.rate ?? Infinity) <= 250;
        return true;
      }),
    [listings, filter],
  );

  const selected = listings.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="grid lg:grid-cols-[400px_1fr] lg:h-[calc(100vh-58px)]">
      {/* list */}
      <aside className="border-r border-hairline bg-surface overflow-y-auto">
        <div className="px-5 pt-[18px] pb-3 sticky top-0 bg-surface z-10 border-b border-hairline">
          <h1 className="text-[19px] tracking-[-0.3px]">Kansas City yards</h1>
          <p className="text-[12.5px] text-ink-3 mt-0.5">
            {visible.length} live {visible.length === 1 ? "listing" : "listings"} · sorted by traffic
          </p>
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-[5px] text-[12.5px] font-semibold border ${
                  filter === f.id
                    ? "bg-brand-wash-2 border-brand-mid text-brand-deep"
                    : "bg-field border-hairline text-ink-2"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-8">
            {listings.length === 0 ? (
              <>
                <b className="block text-[14.5px] mb-1.5">No yards listed yet</b>
                <p className="text-[13.5px] text-ink-2">
                  We&rsquo;re signing up homeowners across the Kansas City metro
                  now. Check back shortly — or list your own yard and be first on
                  the map.
                </p>
                <Link href="/list" className={`${buttonClass("ghost")} mt-3.5`}>
                  List your yard
                </Link>
              </>
            ) : (
              <>
                <b className="block text-[14.5px] mb-1.5">Nothing matches that filter</b>
                <p className="text-[13.5px] text-ink-2">
                  {listings.length} {listings.length === 1 ? "yard is" : "yards are"}{" "}
                  live right now. Try a different filter.
                </p>
                <button
                  onClick={() => setFilter("all")}
                  className={`${buttonClass("ghost")} mt-3.5`}
                >
                  Show all listings
                </button>
              </>
            )}
          </div>
        ) : (
          visible.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedId(l.id)}
              className={`w-full text-left flex gap-3 px-5 py-[15px] border-b border-hairline hover:bg-brand-wash ${
                selectedId === l.id ? "bg-brand-wash-2" : ""
              }`}
            >
              <span className="shrink-0 grid place-items-center w-[62px] h-[62px] rounded-[11px] bg-gradient-to-br from-[#3a4a37] to-[#2e3a2c] text-[#cfe0cd] text-[20px]">
                {l.signalized ? "★" : "🏠"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-[14.5px]">{l.headline}</span>
                <span className="block text-[12.5px] text-ink-2 mt-0.5 mb-1">
                  {l.city}, {l.state}
                  {l.isDemo && (
                    <span className="ml-1.5 rounded-full bg-amber-wash border border-amber-edge text-amber px-1.5 py-[1px] text-[10.5px] font-semibold align-[1px]">
                      Demo
                    </span>
                  )}
                </span>
                <span className="flex gap-3 text-[12.5px] text-ink-2 flex-wrap">
                  <span>
                    <b className="text-ink tabular-nums">
                      {l.aadt === null ? "No count" : fmt(l.aadt)}
                    </b>
                    {l.aadt !== null && " veh/day"}
                  </span>
                  {l.signalized && <span>🚦 Signalized</span>}
                  {l.availableFrom > today() && (
                    <span className="text-amber">Free {describeDay(l.availableFrom)}</span>
                  )}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block font-bold text-[16px]">
                  {money(l.rate)}
                </span>
                <span className="block text-[11.5px] text-ink-3">/month</span>
              </span>
            </button>
          ))
        )}
        {/*
          Every advertiser scrolling to the bottom of a Kansas City list is
          telling us something if they aren't in Kansas City. Cheaper to ask
          than to infer.
        */}
        <div className="px-5 py-4 border-t border-hairline">
          <b className="block text-[13.5px] mb-1">Need yards in another city?</b>
          <p className="text-[12.5px] text-ink-2 mb-2.5">
            The KC metro is the pilot. Tell us where you advertise and we&rsquo;ll
            open that market next.
          </p>
          <WaitlistForm source="browse-other-market" role="business" label="Add me" />
        </div>

        <p className="px-5 py-4 text-[12.5px] text-ink-3">
          Traffic counts come from state DOT data. Yards marked “Demo” are seeded
          examples and can&rsquo;t be booked.
        </p>
      </aside>

      {/* map + drawer */}
      <div className="relative min-h-[380px]">
        <ListingsMap
          apiKey={mapsApiKey}
          pins={visible.map((l) => ({
            id: l.id,
            lat: l.lat,
            lng: l.lng,
            headline: l.headline,
            aadt: l.aadt,
            rate: l.rate,
            featured: l.signalized,
          }))}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selected && (
          <Drawer
            key={selected.id}
            listing={selected}
            userId={userId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------- drawer --------------------------------- */

function Drawer({
  listing,
  userId,
  onClose,
}: {
  listing: PortalListing;
  userId: string | null;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<RequestState, FormData>(submitRequest, {
    status: "idle",
  });
  const [advertiserType, setAdvertiserType] = useState<AdvertiserType>("campaign");
  const [duration, setDuration] = useState("3");
  // Defaults to the soonest the yard is actually free, not to today.
  const [startsOn, setStartsOn] = useState(listing.availableFrom);
  const [install, setInstall] = useState<"self" | "platform">("self");
  const [sizeIndex, setSizeIndex] = useState(0);
  const [upload, setUpload] = useState<{ path: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fit = listing.fits[advertiserType];
  const size = listing.sizes[sizeIndex] ?? listing.sizes[0];
  const months = DURATIONS.find((d) => d.value === duration)?.months ?? 1;

  const isElection = duration === "election";
  const term = termFor({
    startsOn,
    durationMonths: isElection ? null : months,
    isElectionWindow: isElection,
  });
  /*
   * The same check the server runs, so a clash is visible before anybody fills
   * in a form. The server repeats it, and the database refuses an overlap
   * whatever either of them concludes.
   */
  const availability = checkAvailability(term, listing.booked, {
    display_period_days: listing.displayPeriodDays,
    gap_days: listing.gapDays,
  } as never);
  const plan = planBilling({
    monthlyRateDollars: listing.rate ?? 0,
    startsOn: term.startsOn,
    endsOn: term.endsOn,
    install,
  });
  const placementCharges = plan.charges.filter((c) => c.kind === "placement");
  const monthsRemaining = Math.max(0, placementCharges.length - 1);
  const perMonthCents = placementCharges[1]?.amountCents ?? 0;

  async function onFile(file: File) {
    if (!userId) {
      setUploadError("Please sign in before uploading artwork.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await createClient()
        .storage.from("sign-renderings")
        .upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      setUpload({ path, name: file.name });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (state.status === "sent") {
    return (
      <aside className="fixed inset-0 z-[60] lg:absolute lg:inset-4 lg:left-auto lg:w-[430px] lg:z-20 bg-surface border border-edge lg:rounded-panel shadow-lift grid place-items-center text-center p-8">
        <div>
          <div className="grid place-items-center w-[62px] h-[62px] mx-auto mb-4 rounded-full bg-brand-wash-2 text-good-text text-[28px]">
            ✓
          </div>
          <h2 className="text-[20px] mb-2.5">Request sent</h2>
          <p className="text-ink-2 max-w-[34ch] mx-auto mb-4">
            The homeowner reviews your artwork and approves or declines. You&rsquo;ll
            hear back either way — nothing is charged in this release.
          </p>
          <button onClick={onClose} className={buttonClass("ghost")}>
            Back to the map
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed inset-0 z-[60] lg:absolute lg:inset-4 lg:left-auto lg:w-[430px] lg:z-20 bg-surface border border-edge lg:rounded-panel shadow-lift flex flex-col overflow-hidden">
      <header className="flex items-start gap-2.5 px-5 py-4 border-b border-hairline">
        <div>
          <h2 className="text-[17px] tracking-[-0.2px]">{listing.headline}</h2>
          <p className="text-[12.5px] text-ink-3">
            {listing.city}, {listing.state}
            {listing.isDemo && " · seeded example"}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto w-[30px] h-[30px] rounded-[9px] bg-page text-ink-2 text-[15px]"
        >
          ✕
        </button>
      </header>

      <div className="px-5 py-[18px] overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="border border-hairline rounded-[10px] px-3 py-2.5">
            <div className="text-[11.5px] text-ink-3 font-medium">Vehicles per day</div>
            <div className="text-[20px] font-bold">
              {listing.aadt === null ? "No data" : fmt(listing.aadt)}
            </div>
            <div className="text-[11.5px] text-ink-2">
              {listing.trafficSource
                ? `${listing.trafficSource} ${listing.trafficYear ?? ""}`.trim()
                : "not published"}
            </div>
          </div>
          <div className="border border-hairline rounded-[10px] px-3 py-2.5">
            <div className="text-[11.5px] text-ink-3 font-medium">Monthly rate</div>
            <div className="text-[20px] font-bold">
              {money(listing.rate)}
            </div>
            <div className="text-[11.5px] text-ink-2">set by owner</div>
          </div>
        </div>

        {listing.segments.length > 0 && (
          <div className="mb-4">
            {listing.segments.map((s) => (
              <div
                key={`${s.road}-${s.aadt}`}
                className="flex justify-between py-1.5 border-t border-hairline text-[13px] first:border-t-0"
              >
                <span className="font-semibold">{s.road}</span>
                <span className="tabular-nums">{fmt(s.aadt)}</span>
              </div>
            ))}
          </div>
        )}

        <form action={formAction}>
          <input type="hidden" name="listingId" value={listing.id} />
          <input type="hidden" name="advertiserType" value={advertiserType} />
          <input type="hidden" name="signSizeLabel" value={size?.label ?? ""} />
          <input type="hidden" name="signSizeSqft" value={size?.sqft ?? 0} />
          <input type="hidden" name="duration" value={duration} />
          <input type="hidden" name="startsOn" value={startsOn} />
          <input type="hidden" name="install" value={install} />
          <input type="hidden" name="renderingPath" value={upload?.path ?? ""} />

          <fieldset className="mb-4">
            <legend className="text-[12.5px] font-semibold text-ink-2 mb-1.5">
              Who is advertising?
            </legend>
            <div className="flex gap-1.5 flex-wrap">
              {ADVERTISERS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAdvertiserType(a.value)}
                  title={a.hint}
                  className={`rounded-full px-3 py-[5px] text-[12.5px] font-semibold border ${
                    advertiserType === a.value
                      ? "bg-brand-wash-2 border-brand-mid text-brand-deep"
                      : "bg-field border-hairline text-ink-2"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p
              className={`text-[12.5px] rounded-[9px] px-3 py-2 mt-2 ${
                fit.allowed
                  ? "bg-brand-wash text-ink-2"
                  : "bg-amber-wash border border-amber-edge text-amber"
              }`}
            >
              {fit.product && <b>{fit.product} — </b>}
              {fit.reason}
            </p>
          </fieldset>

          <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5" htmlFor="advertiserName">
            Your business or campaign
          </label>
          <input
            id="advertiserName"
            name="advertiserName"
            required
            placeholder="e.g. Heartland Roofing &amp; Exteriors"
            className="w-full border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14.5px] mb-4 focus:outline-none focus:border-brand-mid"
          />

          <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5" htmlFor="size">
            Sign size — all fit {listing.jurisdictionName}
          </label>
          <select
            id="size"
            value={sizeIndex}
            onChange={(e) => setSizeIndex(Number(e.target.value))}
            className="w-full border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14.5px] mb-4"
          >
            {listing.sizes.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label} ({s.sqft} sq ft)
              </option>
            ))}
          </select>

          <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5" htmlFor="duration">
            Duration
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14.5px] mb-4"
          >
            {DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          {/* The election window is those seven weeks by definition, so a
              start date would be a field that does nothing. */}
          {!isElection && (
            <>
              <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5" htmlFor="startsOn">
                Sign goes up
              </label>
              <input
                id="startsOn"
                type="date"
                value={startsOn}
                min={today()}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14.5px] mb-2 focus:outline-none focus:border-brand-mid"
              />
            </>
          )}

          <p
            className={`text-[12.5px] rounded-[9px] px-3 py-2 mb-4 ${
              availability.ok
                ? "bg-brand-wash text-ink-2"
                : "bg-amber-wash border border-amber-edge text-amber"
            }`}
          >
            {availability.ok ? (
              <>
                <b className="text-ink">Up {describeTerm(term)}</b>
                {listing.displayPeriodDays
                  ? ` · ${listing.jurisdictionName} allows ${listing.displayPeriodDays} days at a time`
                  : ""}
              </>
            ) : (
              <>
                {availability.reason}
                {availability.freeFrom && ` Free from ${describeDay(availability.freeFrom)}.`}
              </>
            )}
          </p>

          <fieldset className="mb-4">
            <legend className="text-[12.5px] font-semibold text-ink-2 mb-1.5">
              Installation &amp; removal
            </legend>
            {[
              {
                id: "self" as const,
                title: "We'll install and remove it ourselves",
                body: `$${SELF_INSTALL_DEPOSIT} refundable security deposit — returned when the sign comes down clean and on time.`,
              },
              {
                id: "platform" as const,
                title: "Yardtize installs and removes",
                body: `+$${PLATFORM_INSTALL_EACH_WAY} each way. Our crew, our timeline, zero effort for anyone.`,
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex gap-2.5 items-start border-[1.5px] rounded-[11px] px-3.5 py-2.5 mb-2 cursor-pointer ${
                  install === opt.id ? "border-brand-mid bg-brand-wash" : "border-hairline"
                }`}
              >
                <input
                  type="radio"
                  name="installChoice"
                  checked={install === opt.id}
                  onChange={() => setInstall(opt.id)}
                  className="mt-1 accent-brand"
                />
                <span>
                  <b className="block text-[13.5px]">{opt.title}</b>
                  <span className="text-[12.5px] text-ink-2">{opt.body}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
            Sign design
          </span>
          <label
            className={`block border-[1.5px] border-dashed rounded-[11px] p-4 text-center text-[13px] cursor-pointer mb-1 ${
              upload ? "border-brand-mid bg-brand-wash text-good-text font-semibold border-solid" : "border-hairline text-ink-2"
            }`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            {uploading
              ? "Uploading…"
              : upload
                ? `✓ ${upload.name} uploaded`
                : "⬆︎ Upload your rendering (PDF or image)"}
            <span className="block text-[11.5px] text-ink-3 font-normal mt-1">
              The homeowner sees exactly what they&rsquo;re approving
            </span>
          </label>
          {uploadError && (
            <p role="alert" className="text-[12.5px] text-amber mb-2">
              {uploadError}
            </p>
          )}

          <label className="block text-[12.5px] font-semibold text-ink-2 mb-1.5 mt-3" htmlFor="message">
            Message to the owner (optional)
          </label>
          <textarea
            id="message"
            name="message"
            rows={2}
            placeholder="We're a local company — happy to offer a free spring cleanup with the placement."
            className="w-full border-[1.5px] border-hairline bg-field rounded-[11px] px-3.5 py-2.5 text-[14.5px] focus:outline-none focus:border-brand-mid"
          />

          {/* What they will actually be billed, not a lump estimate: monthly
              in advance, so the first payment is one month plus whatever is
              charged once. */}
          <div className="border-t border-hairline mt-4 pt-3">
            <div className="flex justify-between font-bold text-[15.5px]">
              <span>Due when the owner approves</span>
              <span>{formatCents(plan.dueNowCents)}</span>
            </div>
            <p className="text-[12px] text-ink-2 mt-1 mb-2.5">
              {monthsRemaining > 0
                ? `Then ${formatCents(perMonthCents)} a month for ${monthsRemaining} more ${monthsRemaining === 1 ? "month" : "months"}.`
                : "Nothing further for this placement."}
            </p>
            {plan.charges
              .filter((c) => c.kind !== "placement" || c.dueOn === plan.charges[0].dueOn)
              .map((c) => (
                <Row key={c.label} label={c.label} value={formatCents(c.amountCents)} />
              ))}
            <div className="flex justify-between text-[12.5px] text-ink-2 border-t border-hairline mt-1.5 pt-2">
              <span>Whole term</span>
              <span>{formatCents(plan.totalCents)}</span>
            </div>
            {plan.refundableCents > 0 && (
              <p className="text-[11.5px] text-ink-3 mt-1.5">
                {formatCents(plan.refundableCents)} of that is a deposit — returned
                when the sign comes down clean and on time.
              </p>
            )}
          </div>

          {state.status === "error" && (
            <p role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mt-3">
              {state.message}
            </p>
          )}

          {listing.isDemo && (
            <p className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mt-3">
              <b>This is a demonstration listing.</b> It shows what a real corner
              looks like on Yardtize, with real traffic data — but no homeowner
              is behind it to answer, so it can&rsquo;t be requested.
            </p>
          )}

          {userId ? (
            <SubmitButton disabled={!fit.allowed || listing.isDemo || !availability.ok} />
          ) : (
            <Link href="/sign-in?next=/browse" className={`${buttonClass("primary", "big")} w-full mt-2.5`}>
              Sign in to request →
            </Link>
          )}
          <p className="text-[12.5px] text-ink-3 text-center mt-2">
            No payment is taken in this release. Escrow, the lease and payouts are
            still in the build.
          </p>
        </form>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13.5px] py-0.5">
      <span className="text-ink-2">{label}</span>
      <span>{value}</span>
    </div>
  );
}
