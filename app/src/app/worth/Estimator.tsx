"use client";

import { useState } from "react";
import Link from "next/link";
import { geocodeInBrowser } from "@/lib/maps-loader";
import { SatelliteMap } from "@/app/list/new/SatelliteMap";
import { buttonClass, Card } from "@/components/ui";
import { WaitlistForm } from "@/components/WaitlistForm";

type Estimate = {
  address: { formatted: string; city: string; state: string; lat: number; lng: number };
  traffic: {
    aadtSum: number;
    source: string | null;
    year: number | null;
    segments: Array<{ road: string; roadwayAadt: number; year: number }>;
  } | null;
  rate: { monthly: number; visibleImpressions: number; clamped: boolean } | null;
  compliance?: { covered: boolean; jurisdiction: string | null; verified: boolean };
  note?: string;
  remaining: number;
};

const fmt = (n: number) => n.toLocaleString("en-US");

export function Estimator({ apiKey }: { apiKey: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Estimate | null>(null);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      /*
       * Geocoded here rather than on the server: the Maps key is restricted by
       * HTTP referrer, and Google refuses referrer-restricted keys on its
       * server-side geocoding API. The listing wizard does the same.
       */
      const address = await geocodeInBrowser(apiKey, query.trim());

      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: address.lat,
          lng: address.lng,
          city: address.city,
          state: address.state,
          formatted: address.formatted,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't work. Try again in a moment.");
        return;
      }
      setResult(data as Estimate);
    } catch (err) {
      const reason = (err as Error).message;
      setError(
        reason === "NO_RESULTS" || reason === "NO_CITY"
          ? "We couldn't find that address. Try adding the city and state."
          : "Address lookup didn't respond. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={check} className="flex gap-2 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="123 Main St, your city"
          aria-label="Your address"
          autoComplete="street-address"
          className="flex-1 min-w-[240px] text-[16px] px-4 py-3 rounded-[11px] border border-edge bg-field text-ink"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className={`${buttonClass("primary")} disabled:opacity-60`}
        >
          {busy ? "Checking…" : "What's it worth?"}
        </button>
      </form>

      <p className="text-[12.5px] text-ink-3 mt-2">
        We don&rsquo;t store your address. Nothing is created and nobody is
        contacted — this is a lookup.
      </p>

      {error && (
        <Card className="p-4 mt-4 border-amber-edge bg-amber-wash">
          <p className="text-[13.5px]">{error}</p>
        </Card>
      )}

      {result && <Result result={result} apiKey={apiKey} />}
    </>
  );
}

function Result({ result, apiKey }: { result: Estimate; apiKey: string }) {
  const { address, traffic, rate, compliance } = result;

  return (
    <div className="mt-6">
      <h2 className="text-[19px] tracking-[-0.3px]">{address.formatted}</h2>

      {/* No count, no number. The whole argument is that the price comes from
          a published figure, so silence has to stay silence. */}
      {!traffic || !rate ? (
        <Card className="p-[22px] mt-3">
          <b className="text-[15px]">No published traffic count here</b>
          <p className="text-[13.5px] text-ink-2 mt-1.5 max-w-[52ch]">
            {result.note ??
              "No agency publishes a count for the roads at this address."}{" "}
            That usually means a quiet residential street — which is honest
            rather than disappointing: a sign there would be seen by neighbours,
            not by thirty thousand cars.
          </p>
          <p className="text-[13.5px] text-ink-2 mt-2.5">
            Try a corner near you on a busier road.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <Card className="p-[18px]">
              <div className="text-[11.5px] text-ink-3 font-medium">Traffic past this yard</div>
              <div className="text-[24px] font-bold tracking-[-0.5px] mt-0.5 tabular-nums">
                {fmt(traffic.aadtSum)}/day
              </div>
              <div className="text-[11.5px] text-ink-2">
                {traffic.source}
                {traffic.year ? ` ${traffic.year}` : ""}
              </div>
            </Card>
            <Card className="p-[18px]">
              <div className="text-[11.5px] text-ink-3 font-medium">Suggested rate</div>
              <div className="text-[24px] font-bold tracking-[-0.5px] mt-0.5 tabular-nums">
                ${fmt(rate.monthly)}
              </div>
              <div className="text-[11.5px] text-ink-2">per month, before extras</div>
            </Card>
            <Card className="p-[18px]">
              <div className="text-[11.5px] text-ink-3 font-medium">Eyes on the sign</div>
              <div className="text-[24px] font-bold tracking-[-0.5px] mt-0.5 tabular-nums">
                {fmt(rate.visibleImpressions)}
              </div>
              <div className="text-[11.5px] text-ink-2">credited per month</div>
            </Card>
          </div>

          <Card className="p-0 mt-3 overflow-hidden">
            <div className="h-[260px]">
              <SatelliteMap
                apiKey={apiKey}
                center={{ lat: address.lat, lng: address.lng }}
                pin={{ lat: address.lat, lng: address.lng }}
              />
            </div>
          </Card>

          <Card className="p-[22px] mt-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink-3 mb-2">
              Where the number comes from
            </h3>
            {traffic.segments.map((s, i) => (
              <div
                key={`${s.road}-${i}`}
                className="flex justify-between items-baseline gap-3 py-1.5 border-t border-hairline first:border-t-0"
              >
                <span className="text-[13.5px]">{s.road}</span>
                <span className="text-[13.5px] tabular-nums text-ink-2">
                  {fmt(s.roadwayAadt)}/day{s.year ? ` · ${s.year}` : ""}
                </span>
              </div>
            ))}
            <p className="text-[12.5px] text-ink-2 mt-3 max-w-[58ch]">
              This is the official count published by{" "}
              {traffic.source === "MoDOT"
                ? "the Missouri Department of Transportation"
                : traffic.source === "KDOT"
                  ? "the Kansas Department of Transportation"
                  : "the Federal Highway Administration"}
              , not an estimate of ours. A small sign at eye level is credited
              with a fraction of the traffic passing it, and that same fraction
              sets the price — the arithmetic is the same one every listing on
              Yardtize uses.
            </p>
            {rate.clamped && (
              <p className="text-[12.5px] text-ink-3 mt-2">
                This corner is busy enough that the rate hits our ceiling. A real
                listing there is worth a conversation.
              </p>
            )}
          </Card>

          {compliance?.covered ? (
            <Card className="p-[22px] mt-3">
              <b className="text-[14.5px]">
                We&rsquo;ve read the sign code for {compliance.jurisdiction}
              </b>
              <p className="text-[13.5px] text-ink-2 mt-1.5 max-w-[56ch]">
                List your yard and we&rsquo;ll size and place the sign to that
                code, and show you the rules it has to satisfy before anything
                goes in the ground.
              </p>
              <div className="mt-3">
                <Link href="/list/new" className={buttonClass("primary")}>
                  List this yard →
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="p-[22px] mt-3">
              <b className="text-[14.5px]">
                We haven&rsquo;t read {address.city}&rsquo;s sign code yet
              </b>
              <p className="text-[13.5px] text-ink-2 mt-1.5 mb-3 max-w-[56ch]">
                The traffic figure above is real and works anywhere in the
                country. What has to be done city by city is the sign
                ordinance — and we won&rsquo;t put a sign in your yard before
                reading yours. Tell us where you are and demand decides the
                order.
              </p>
              <WaitlistForm source="worth" label="Add my city" />
            </Card>
          )}
        </>
      )}

      <p className="text-[12px] text-ink-3 mt-4">
        {result.remaining > 0
          ? `${result.remaining} more lookups today.`
          : "That's your last free lookup today."}
      </p>
    </div>
  );
}
