"use client";

declare global {
  interface Window {
    google?: typeof google;
    __yardtizeMapsPromise?: Promise<void>;
  }
}

/**
 * Loads the Google Maps JS API once per page, however many components need it.
 *
 * Address lookup runs through this in the browser rather than on the server,
 * because the API key is restricted by website referrer — Google rejects those
 * keys outright on server-to-server calls ("API keys with referer restrictions
 * cannot be used with this API"). Geocoding from the browser keeps a single
 * restricted key working for both the map and the address search.
 */
export function loadMaps(apiKey: string, timeoutMs = 8_000): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__yardtizeMapsPromise) return window.__yardtizeMapsPromise;

  window.__yardtizeMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=geocoding`;
    script.async = true;

    // A blocked or very slow network can leave the request hanging rather than
    // firing onerror, so bound it and let callers show a fallback.
    const timer = setTimeout(() => {
      delete window.__yardtizeMapsPromise;
      reject(new Error("Google Maps timed out"));
    }, timeoutMs);

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

export type BrowserGeocode = {
  formatted: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  precision: string;
};

/** Resolves a typed address using the browser's Maps client. */
export async function geocodeInBrowser(
  apiKey: string,
  query: string,
): Promise<BrowserGeocode> {
  await loadMaps(apiKey);
  const g = window.google!.maps;
  const geocoder = new g.Geocoder();

  const { results } = await geocoder.geocode({
    address: query,
    componentRestrictions: { country: "US" },
  });
  if (!results.length) throw new Error("NO_RESULTS");

  const top = results[0];
  const pick = (type: string, short = false) =>
    top.address_components.find((c) => c.types.includes(type))?.[
      short ? "short_name" : "long_name"
    ] ?? "";

  const city =
    pick("locality") || pick("sublocality") || pick("administrative_area_level_3");
  if (!city) throw new Error("NO_CITY");

  return {
    formatted: top.formatted_address,
    streetAddress:
      [pick("street_number"), pick("route")].filter(Boolean).join(" ") ||
      top.formatted_address,
    city,
    state: pick("administrative_area_level_1", true),
    postalCode: pick("postal_code") || null,
    lat: top.geometry.location.lat(),
    lng: top.geometry.location.lng(),
    precision: String(top.geometry.location_type ?? "UNKNOWN"),
  };
}
