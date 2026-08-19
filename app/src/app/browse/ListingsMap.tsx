"use client";

import { useEffect, useRef, useState } from "react";

type Pin = {
  id: string;
  lat: number;
  lng: number;
  headline: string;
  aadt: number | null;
  rate: number | null;
  featured: boolean;
};

function loadMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__yardtizeMapsPromise) return window.__yardtizeMapsPromise;

  window.__yardtizeMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    const timer = setTimeout(() => {
      delete window.__yardtizeMapsPromise;
      reject(new Error("Google Maps timed out"));
    }, 8_000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      delete window.__yardtizeMapsPromise;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
  return window.__yardtizeMapsPromise;
}

/** Map of every live listing, with the busiest corners marked in gold. */
export function ListingsMap({
  apiKey,
  pins,
  selectedId,
  onSelect,
}: {
  apiKey: string | null;
  pins: Pin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const selectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!apiKey || !holder.current || !pins.length) return;
    let cancelled = false;

    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !holder.current || !window.google) return;
        const g = window.google.maps;

        const bounds = new g.LatLngBounds();
        pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));

        const map = new g.Map(holder.current, {
          center: bounds.getCenter(),
          zoom: 11,
          mapTypeId: "roadmap",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        if (pins.length > 1) map.fitBounds(bounds, 64);

        for (const p of pins) {
          const marker = new g.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            title: p.headline,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: p.featured ? "#eda100" : "#16a34a",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2.5,
            },
          });
          const info = new g.InfoWindow({
            content: `<b>${p.headline}</b><br>${
              p.aadt ? p.aadt.toLocaleString("en-US") + " vehicles/day" : "no count published"
            }${p.rate ? " · $" + p.rate + "/mo" : ""}`,
          });
          marker.addListener("click", () => {
            info.open({ map, anchor: marker });
            selectRef.current(p.id);
          });
          markersRef.current.set(p.id, marker);
        }
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, pins.length]);

  // Pan to whichever listing is selected in the list.
  useEffect(() => {
    if (!selectedId) return;
    const marker = markersRef.current.get(selectedId);
    const position = marker?.getPosition();
    if (position) mapRef.current?.panTo(position);
  }, [selectedId]);

  if (!apiKey || failed || !pins.length) {
    return (
      <div
        className="h-full min-h-[320px] grid place-items-center text-center px-8"
        style={{
          background: `linear-gradient(rgba(20,60,30,.25),rgba(20,60,30,.25)),
            repeating-linear-gradient(45deg,#2e3a2c 0 30px,#354534 30px 60px)`,
        }}
      >
        <div className="text-[#dfe6dd] text-[13.5px] max-w-[40ch]">
          <div className="text-[30px] mb-2.5" aria-hidden="true">
            🗺️
          </div>
          {!pins.length
            ? "No live listings to map yet."
            : "The map couldn't load — use the list on the left, every listing opens the full booking flow."}
        </div>
      </div>
    );
  }

  return <div ref={holder} className="h-full min-h-[320px]" />;
}
