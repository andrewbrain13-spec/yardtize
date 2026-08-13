"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: typeof google;
    __yardtizeMapsPromise?: Promise<void>;
  }
}

/** Loads the Maps JS API once per page, however many maps mount. */
function loadMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__yardtizeMapsPromise) return window.__yardtizeMapsPromise;

  window.__yardtizeMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;

    // A blocked or very slow network can leave the request hanging instead of
    // firing onerror, which would leave an empty grey box on screen. Time it
    // out so the labelled placeholder appears instead.
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

export type SatelliteMapProps = {
  apiKey: string | null;
  center: { lat: number; lng: number };
  pin: { lat: number; lng: number };
  onPinMove: (pos: { lat: number; lng: number }) => void;
};

/**
 * Aerial view of the property with a draggable sign pin.
 *
 * Renders a labelled placeholder rather than an error when no key is present,
 * so the rest of the wizard — traffic, compliance, pricing — still demos.
 */
export function SatelliteMap({ apiKey, center, pin, onPinMove }: SatelliteMapProps) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const moveRef = useRef(onPinMove);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    moveRef.current = onPinMove;
  }, [onPinMove]);

  useEffect(() => {
    if (!apiKey || !holder.current) return;
    let cancelled = false;

    loadMaps(apiKey)
      .then(() => {
        if (cancelled || !holder.current || !window.google) return;

        const map = new window.google.maps.Map(holder.current, {
          center,
          zoom: 19,
          mapTypeId: "satellite",
          tilt: 0,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          scrollwheel: false,
        });
        mapRef.current = map;

        const marker = new window.google.maps.Marker({
          position: pin,
          map,
          draggable: true,
          title: "Drag to where your sign would stand",
        });
        markerRef.current = marker;

        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) moveRef.current({ lat: p.lat(), lng: p.lng() });
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
    // Built once; later prop changes are pushed imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Recentre when a new address is looked up.
  useEffect(() => {
    mapRef.current?.setCenter(center);
    markerRef.current?.setPosition(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  if (!apiKey || failed) {
    return (
      <div
        className="h-[470px] grid place-items-center text-center px-8"
        style={{
          background: `linear-gradient(rgba(20,60,30,.25),rgba(20,60,30,.25)),
            repeating-linear-gradient(45deg,#2e3a2c 0 30px,#354534 30px 60px)`,
        }}
      >
        <div className="text-[#dfe6dd] text-[13.5px] max-w-[42ch]">
          <div className="text-[30px] mb-2.5" aria-hidden="true">
            🗺️
          </div>
          {failed
            ? "The satellite view couldn't load."
            : "Satellite view needs the Google Maps key added to this deployment."}
          <br />
          Everything else on this page — the traffic counts, the compliance
          check and the pricing — is live.
        </div>
      </div>
    );
  }

  return <div ref={holder} className="h-[470px] bg-[#2e3a2c]" />;
}
