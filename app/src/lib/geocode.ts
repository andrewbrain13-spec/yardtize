/**
 * Address lookup via Google Geocoding, called only from the server so the API
 * key is never handed to the browser.
 */

export type GeocodedAddress = {
  formatted: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  /** ROOFTOP means Google placed it on the building itself. */
  precision: string;
};

export type GeocodeResult =
  | { ok: true; address: GeocodedAddress }
  | { ok: false; reason: string };

type Component = { long_name: string; short_name: string; types: string[] };

const pick = (components: Component[], type: string, short = false) =>
  components.find((c) => c.types.includes(type))?.[short ? "short_name" : "long_name"] ?? "";

export async function geocodeAddress(query: string): Promise<GeocodeResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { ok: false, reason: "Address lookup isn't configured on this deployment yet." };
  }

  const params = new URLSearchParams({
    address: query,
    components: "country:US",
    key,
  });

  let body;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    body = await res.json();
  } catch {
    return { ok: false, reason: "Couldn't reach the address service. Please try again." };
  }

  if (body.status === "ZERO_RESULTS") {
    return { ok: false, reason: "We couldn't find that address. Try including the city and state." };
  }
  if (body.status !== "OK" || !body.results?.length) {
    return { ok: false, reason: "That address couldn't be looked up. Please check it and try again." };
  }

  const top = body.results[0];
  const components: Component[] = top.address_components ?? [];

  const streetNumber = pick(components, "street_number");
  const route = pick(components, "route");
  const city =
    pick(components, "locality") ||
    pick(components, "sublocality") ||
    pick(components, "administrative_area_level_3");

  if (!city) {
    return { ok: false, reason: "That looks like an incomplete address — we need a city to check sign rules." };
  }

  return {
    ok: true,
    address: {
      formatted: top.formatted_address,
      streetAddress: [streetNumber, route].filter(Boolean).join(" ") || top.formatted_address,
      city,
      state: pick(components, "administrative_area_level_1", true),
      postalCode: pick(components, "postal_code") || null,
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      precision: top.geometry.location_type ?? "UNKNOWN",
    },
  };
}
