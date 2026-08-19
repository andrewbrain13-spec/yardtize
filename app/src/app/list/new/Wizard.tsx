"use client";

import { useEffect, useState, useTransition } from "react";
import { buttonClass, Badge, Card } from "@/components/ui";
import { attachJurisdiction, publishListing, type LookupState } from "./actions";
import { geocodeInBrowser } from "@/lib/maps-loader";
import { SatelliteMap } from "./SatelliteMap";
import type { CountedSegment } from "@/lib/traffic/types";

type LatLng = { lat: number; lng: number };

type TrafficData = {
  error: string | null;
  aadtSum: number | null;
  segments: CountedSegment[];
  source: string | null;
  year: number | null;
  suggested: number | null;
};

const EMPTY: Omit<TrafficData, "error"> = {
  aadtSum: null,
  segments: [],
  source: null,
  year: null,
  suggested: null,
};

const fmt = (n: number) => n.toLocaleString("en-US");

/* ------------------------------- step chrome ------------------------------ */

function Crumbs({ step }: { step: number }) {
  const labels = ["Your address", "Place your sign", "Review & publish"];
  return (
    <ol className="flex items-center gap-2.5 mb-[22px] flex-wrap">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = step === n ? "on" : step > n ? "done" : "todo";
        return (
          <li key={label} className="flex items-center gap-2.5">
            {i > 0 && <span className="w-[34px] h-[1.5px] bg-hairline" aria-hidden="true" />}
            <span
              className={`flex items-center gap-2 text-[13px] font-semibold ${
                state === "on" ? "text-brand-deep" : state === "done" ? "text-good-text" : "text-ink-3"
              }`}
            >
              <span
                className={`grid place-items-center w-6 h-6 rounded-full text-[12px] font-bold border-[1.5px] ${
                  state === "on"
                    ? "bg-brand border-brand text-white"
                    : state === "done"
                      ? "bg-brand-wash-2 border-brand-mid text-good-text"
                      : "bg-surface border-hairline"
                }`}
              >
                {state === "done" ? "✓" : n}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------- wizard -------------------------------- */

export function Wizard({ mapsApiKey }: { mapsApiKey: string | null }) {
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [searching, setSearching] = useState(false);
  const found = lookup.status === "found" ? lookup : null;

  /*
   * The address is resolved in the browser and only then handed to the server,
   * which attaches the city's sign rules. Geocoding cannot run server-side
   * here: the Maps key is restricted by website referrer, and Google refuses
   * those keys on server-to-server calls.
   */
  async function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("address") ?? "").trim();
    if (query.length < 5) {
      setLookup({ status: "error", message: "Please enter a full street address.", query });
      return;
    }
    if (!mapsApiKey) {
      setLookup({
        status: "error",
        message: "Address lookup isn't configured on this deployment yet.",
        query,
      });
      return;
    }

    setSearching(true);
    try {
      const address = await geocodeInBrowser(mapsApiKey, query);
      setLookup(await attachJurisdiction(address));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setLookup({
        status: "error",
        query,
        message:
          code === "NO_RESULTS"
            ? "We couldn't find that address. Try including the city and state."
            : code === "NO_CITY"
              ? "That looks incomplete — we need a city to check sign rules."
              : "The address service didn't respond. Please try again.",
      });
    } finally {
      setSearching(false);
    }
  }

  /*
   * Navigation and the pin are stored against the address they belong to.
   * Looking up a different address makes the stored key stop matching, so the
   * derived defaults take over — no effect needed to reset the wizard.
   */
  const addressKey = found ? `${found.address.lat},${found.address.lng}` : "";
  const [nav, setNav] = useState<{ key: string; step: number; pin: LatLng | null }>({
    key: "",
    step: 1,
    pin: null,
  });
  const current =
    nav.key === addressKey
      ? nav
      : {
          key: addressKey,
          step: found ? 2 : 1,
          pin: found ? { lat: found.address.lat, lng: found.address.lng } : null,
        };
  const { step, pin } = current;

  const [signalized, setSignalized] = useState(false);
  const [cornerLot, setCornerLot] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();

  /*
   * Traffic results are tagged with the request they answer, so "still
   * loading" is derived by comparing keys rather than being a second piece of
   * state that could drift out of step with the pin.
   */
  const requestKey = found && pin ? `${pin.lat},${pin.lng},${signalized},${cornerLot}` : "";
  const [result, setResult] = useState<{ key: string; data: TrafficData } | null>(null);
  const traffic = result?.key === requestKey ? result.data : null;
  const loading = Boolean(requestKey) && !traffic;

  useEffect(() => {
    if (!requestKey || !found || !pin) return;
    const controller = new AbortController();
    let alive = true;

    (async () => {
      // Every setState below runs after an await, never synchronously inside
      // the effect body — that would cascade a render on every pin drag.
      try {
        const res = await fetch("/api/traffic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pin.lat,
            lng: pin.lng,
            state: found.address.state,
            signalized,
            cornerLot,
          }),
          signal: controller.signal,
        });
        const body = await res.json();
        if (!alive) return;

        setResult({
          key: requestKey,
          data: res.ok
            ? {
                error: null,
                aadtSum: body.traffic.aadtSum,
                segments: body.traffic.segments ?? [],
                source: body.traffic.source,
                year: body.traffic.year,
                suggested: body.rate?.monthly ?? null,
              }
            : { ...EMPTY, error: body.error ?? "Traffic lookup failed." },
        });
      } catch {
        if (alive && !controller.signal.aborted) {
          setResult({
            key: requestKey,
            data: { ...EMPTY, error: "Couldn't reach the traffic service." },
          });
        }
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [requestKey, found, pin, signalized, cornerLot]);

  // An owner's override sticks to the placement it was set for; moving the pin
  // re-reveals the suggestion for the new spot.
  const [rateEdit, setRateEdit] = useState<{ key: string; value: number } | null>(null);
  const edited = rateEdit?.key === requestKey;
  const rate = edited ? rateEdit!.value : (traffic?.suggested ?? null);

  const onPublish = () => {
    if (!found || !pin || rate === null || !traffic) return;
    setPublishError(null);
    startPublish(async () => {
      const outcome = await publishListing({
        address: found.address,
        jurisdictionId: found.compliance.jurisdictionId,
        signLat: pin.lat,
        signLng: pin.lng,
        aadtSum: traffic.aadtSum,
        segments: traffic.segments.map((s) => ({
          road: s.road,
          aadt: s.roadwayAadt,
          year: s.year,
          source: s.source,
        })),
        source: traffic.source,
        year: traffic.year,
        signalized,
        cornerLot,
        suggestedRate: traffic.suggested,
        monthlyRate: rate,
      });
      if (outcome?.error) setPublishError(outcome.error);
    });
  };

  /* --------------------------------- step 1 -------------------------------- */

  if (step === 1 || !found || !pin) {
    return (
      <div className="max-w-[1120px] mx-auto px-[26px] pt-[30px] pb-[50px]">
        <Crumbs step={1} />
        <Card className="max-w-[620px] mx-auto my-10 px-9 py-[42px] text-center">
          <h1 className="text-[26px] tracking-[-0.4px]">Where&rsquo;s the yard?</h1>
          <p className="text-ink-2 mt-2.5 mb-6">
            We&rsquo;ll pull up an aerial view and the official traffic counts for
            the roads around you.
          </p>
          <form onSubmit={onSearch}>
            <label htmlFor="address" className="block text-left text-[12.5px] font-semibold text-ink-2 mb-1.5 ml-0.5">
              Property address
            </label>
            <div className="flex gap-2.5 flex-col sm:flex-row">
              <input
                id="address"
                name="address"
                required
                autoComplete="street-address"
                defaultValue={lookup.status === "error" ? (lookup.query ?? "") : ""}
                placeholder="3103 Karnes Blvd, Kansas City, MO 64111"
                className="w-full border-[1.5px] border-hairline bg-white rounded-[11px] px-3.5 py-3 text-[15.5px] focus:outline-none focus:border-brand-mid"
              />
              <button
                type="submit"
                disabled={searching}
                className={`${buttonClass()} whitespace-nowrap disabled:opacity-60`}
              >
                {searching ? "Finding…" : "Find my yard →"}
              </button>
            </div>
            {lookup.status === "error" && (
              <p role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mt-3 text-left">
                {lookup.message}
              </p>
            )}
          </form>
          <p className="text-[12.5px] text-ink-3 mt-3.5">
            Any Missouri or Kansas address works — traffic counts come straight
            from the state.
          </p>
        </Card>
      </div>
    );
  }

  const { address, compliance } = found;

  /* --------------------------------- step 3 -------------------------------- */

  if (step === 3) {
    return (
      <div className="max-w-[1120px] mx-auto px-[26px] pt-[30px] pb-[50px]">
        <Crumbs step={3} />
        <div className="grid lg:grid-cols-2 gap-[22px] items-start">
          <div>
            <h1 className="text-[26px] tracking-[-0.4px]">Ready to go live?</h1>
            <p className="text-ink-2 mt-2.5 mb-5 max-w-[46ch]">
              This is what businesses will see. You stay anonymous until you
              approve a request — advertisers see the corner and the traffic, not
              your name or address.
            </p>
            <Card className="p-[18px] mb-3.5">
              <h2 className="text-[14.5px] font-bold mb-3">What happens next</h2>
              <ol className="flex flex-col gap-1.5">
                {[
                  "A business requests your yard with their sign design and dates",
                  "You approve or decline — total control, every time",
                  "The sign goes up; we handle any city notice",
                  "Lease signing and monthly payouts arrive in a later release",
                ].map((line, i) => (
                  <li key={line} className="flex gap-2.5 text-[13.5px] items-start">
                    <span className="shrink-0 grid place-items-center w-[18px] h-[18px] mt-0.5 rounded-full bg-brand-wash-2 text-good-text text-[11px] font-extrabold">
                      {i + 1}
                    </span>
                    <span className="text-ink-2">{line}</span>
                  </li>
                ))}
              </ol>
            </Card>
            {publishError && (
              <p role="alert" className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2 mb-3">
                {publishError}
              </p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button onClick={onPublish} disabled={publishing} className={`${buttonClass("primary", "big")} disabled:opacity-60`}>
                {publishing ? "Publishing…" : "Publish my listing"}
              </button>
              <button onClick={() => setNav({ ...current, step: 2 })} className={buttonClass("ghost", "big")}>
                ← Adjust
              </button>
            </div>
          </div>

          <div className="border border-edge rounded-panel overflow-hidden shadow-lift bg-white">
            <SatelliteMap apiKey={mapsApiKey} center={pin} pin={pin} onPinMove={() => {}} />
            <div className="px-[18px] py-4">
              <div className="flex justify-between items-center gap-2.5">
                <div className="font-bold text-[15.5px]">
                  {signalized ? "Signalized corner" : cornerLot ? "Corner lot" : "Frontage"} · {address.city}
                </div>
                {signalized && <Badge tone="gold">★ Featured</Badge>}
              </div>
              <div className="text-[12.5px] text-ink-3 mt-[3px]">
                {address.city}, {address.state}
              </div>
              <div className="flex mt-[13px] border-t border-hairline pt-[13px]">
                <div className="flex-1">
                  <div className="text-[11.5px] text-ink-3 font-medium">Vehicles/day</div>
                  <div className="text-[21px] font-bold">
                    {traffic?.aadtSum == null ? "—" : `${(traffic.aadtSum / 1000).toFixed(1)}K`}
                  </div>
                  <div className="text-[11.5px] text-ink-2">
                    {traffic?.source ? `${traffic.source} ${traffic.year ?? ""}`.trim() : "no data"}
                  </div>
                </div>
                <div className="flex-1 border-l border-hairline pl-3.5">
                  <div className="text-[11.5px] text-ink-3 font-medium">Rate</div>
                  <div className="text-[21px] font-bold">${rate ?? "—"}</div>
                  <div className="text-[11.5px] text-ink-2">per month</div>
                </div>
                <div className="flex-1 border-l border-hairline pl-3.5">
                  <div className="text-[11.5px] text-ink-3 font-medium">Max sign</div>
                  <div className="text-[21px] font-bold">{compliance.maxOfferedSqft} ft²</div>
                  <div className="text-[11.5px] text-ink-2">city-compliant</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------- step 2 -------------------------------- */

  const suggested = traffic?.suggested ?? null;
  const sliderMin = Math.max(40, Math.round(((suggested ?? 100) * 0.5) / 5) * 5);
  const sliderMax = Math.min(600, Math.round(((suggested ?? 300) * 1.6) / 5) * 5);

  return (
    <div className="max-w-[1120px] mx-auto px-[26px] pt-[30px] pb-[50px]">
      <Crumbs step={2} />
      <div className="grid lg:grid-cols-[1fr_375px] gap-[18px] items-start">
        <div className="bg-surface border border-edge rounded-panel shadow-card overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-hairline">
            <b className="text-[14.5px]">{address.formatted}</b>
            <Badge>Aerial view</Badge>
          </div>
          <SatelliteMap
            apiKey={mapsApiKey}
            center={{ lat: address.lat, lng: address.lng }}
            pin={pin}
            onPinMove={(p) => setNav({ ...current, pin: p })}
          />
          <p className="px-4 py-2.5 text-[12.5px] text-ink-3 border-t border-hairline">
            🚦 Drag the pin to where a sign would stand. The traffic counts and
            your rate update from the roads nearest that spot.
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card className="p-[18px]">
            <h2 className="text-[14.5px] font-bold mb-3">Traffic value</h2>
            {loading ? (
              <p className="text-ink-2 text-[13.5px]">Checking the state traffic database…</p>
            ) : traffic?.error ? (
              <p className="text-[13px] text-amber bg-amber-wash border border-amber-edge rounded-[9px] px-3 py-2">
                {traffic.error}
              </p>
            ) : traffic?.aadtSum == null ? (
              <p className="text-ink-2 text-[13.5px]">
                No official count is published for the roads right here. Try
                dragging the pin toward the nearest through road.
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[34px] font-bold tracking-[-1px]">{fmt(traffic.aadtSum)}</span>
                  <span className="text-[12.5px] text-ink-3">vehicles/day</span>
                </div>
                <div className="mt-2.5">
                  {traffic.segments.map((s) => (
                    <div key={`${s.road}-${s.roadwayAadt}`} className="flex justify-between items-center py-2 border-t border-hairline first:border-t-0 text-[13.5px]">
                      <span className="font-semibold">
                        {s.road}
                        <span className="text-ink-3 text-[11.5px] ml-1.5">{s.distanceMeters} m away</span>
                      </span>
                      <span className="font-bold tabular-nums">{fmt(s.roadwayAadt)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[12.5px] text-ink-3 mt-2">
                  Source: {traffic.source} {traffic.year}. Both directions.
                </p>
              </>
            )}
          </Card>

          <Card className="p-[18px]">
            <h2 className="text-[14.5px] font-bold mb-3">About this spot</h2>
            {[
              { on: signalized, set: setSignalized, label: "At a signalized intersection", sub: "Stopped traffic is worth more (×1.25)" },
              { on: cornerLot, set: setCornerLot, label: "Corner lot", sub: "Visible from two roads (×1.15)" },
            ].map((row) => (
              <label key={row.label} className="flex gap-2.5 items-start py-1.5 cursor-pointer">
                <input type="checkbox" checked={row.on} onChange={(e) => row.set(e.target.checked)} className="mt-1 accent-brand" />
                <span>
                  <b className="block text-[13.5px]">{row.label}</b>
                  <span className="text-[12.5px] text-ink-2">{row.sub}</span>
                </span>
              </label>
            ))}
          </Card>

          <Card className="p-[18px]">
            <h2 className="text-[14.5px] font-bold mb-3">
              Compliance — {compliance.jurisdictionName}
            </h2>
            {compliance.checks.map((c) => (
              <div key={c.label} className="flex gap-2.5 py-1.5 text-[13.5px] items-start">
                <span
                  className={`shrink-0 grid place-items-center w-[18px] h-[18px] mt-0.5 rounded-full text-[11px] font-extrabold ${
                    c.status === "pass"
                      ? "bg-brand-wash-2 text-good-text"
                      : c.status === "warn"
                        ? "bg-amber-wash text-amber"
                        : "bg-biz-wash text-biz"
                  }`}
                >
                  {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "i"}
                </span>
                <span className="text-ink-2">{c.label}</span>
              </div>
            ))}
            {compliance.citations.length > 0 && (
              <p className="text-[11.5px] text-ink-3 mt-2">{compliance.citations.join(" · ")}</p>
            )}
          </Card>

          <Card className="p-[18px]">
            <h2 className="text-[14.5px] font-bold mb-3">Your monthly rate</h2>
            {rate === null ? (
              <p className="text-ink-2 text-[13.5px]">
                We price from traffic, so we need a count before suggesting a rate.
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-bold tracking-[-1px]">${rate}</span>
                  <span className="text-[12.5px] text-ink-3">
                    /month {edited ? "(yours)" : "suggested"}
                  </span>
                </div>
                <label htmlFor="rate" className="sr-only">Monthly rate</label>
                <input
                  id="rate"
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={5}
                  value={rate}
                  onChange={(e) => setRateEdit({ key: requestKey, value: Number(e.target.value) })}
                  className="w-full accent-brand my-2.5"
                />
                <div className="flex justify-between text-[11.5px] text-ink-3">
                  <span>${sliderMin}</span>
                  {suggested !== null && <span>Suggested: ${suggested}</span>}
                  <span>${sliderMax}</span>
                </div>
                {traffic?.aadtSum != null && (
                  <p className="text-[12.5px] text-ink-3 mt-2">
                    {fmt(traffic.aadtSum)} vehicles/day × $6 per thousand
                    {signalized && " × 1.25 signalized"}
                    {cornerLot && " × 1.15 corner"}. You approve every advertiser
                    either way.
                  </p>
                )}
              </>
            )}
          </Card>

          <button
            onClick={() => setNav({ ...current, step: 3 })}
            disabled={rate === null}
            className={`${buttonClass("primary", "big")} w-full disabled:opacity-50`}
          >
            Preview my listing →
          </button>
        </div>
      </div>

      <div className="mt-[18px]">
        <button onClick={() => setNav({ key: "", step: 1, pin: null })} className={buttonClass("ghost")}>
          ← Back
        </button>
      </div>
    </div>
  );
}
