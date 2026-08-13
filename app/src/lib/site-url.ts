import { headers } from "next/headers";

/**
 * Absolute origin of the current request, used to build magic-link redirects.
 * Derived from the request rather than hardcoded so the same code works on
 * localhost, the vercel.app URL, and yardtize.com without a rebuild.
 */
export async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
