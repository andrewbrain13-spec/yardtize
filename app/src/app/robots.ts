import type { MetadataRoute } from "next";

/**
 * Pre-launch: keep the whole site out of search results.
 *
 * The demo carries seeded listings and rates that are still being tuned, and
 * Andrew has not launched publicly. Flip `LAUNCHED` to true to open the site to
 * crawlers — the matching noindex tag in the root layout reads the same flag,
 * so both change together.
 */
export const LAUNCHED = false;

export default function robots(): MetadataRoute.Robots {
  return LAUNCHED
    ? {
        rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/inbox", "/dashboard"] }],
        sitemap: "https://www.yardtize.com/sitemap.xml",
      }
    : { rules: [{ userAgent: "*", disallow: "/" }] };
}
