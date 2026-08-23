import type { MetadataRoute } from "next";

/**
 * Whether the site is open to search engines.
 *
 * The root layout's robots meta tag reads the same flag, so the file and the
 * tag can never disagree — a mismatch between them is the classic way a site
 * ends up indexed while its owner believes otherwise.
 */
export const LAUNCHED = true;

export default function robots(): MetadataRoute.Robots {
  return LAUNCHED
    ? {
        rules: [
          {
            userAgent: "*",
            allow: "/",
            // Signed-in surfaces and anything naming a specific person or
            // property. /agreement carries street addresses.
            disallow: ["/api/", "/inbox", "/dashboard", "/admin", "/agreement/", "/list/"],
          },
        ],
        sitemap: "https://www.yardtize.com/sitemap.xml",
      }
    : { rules: [{ userAgent: "*", disallow: "/" }] };
}
