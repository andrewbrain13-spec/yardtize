import type { MetadataRoute } from "next";
import { LAUNCHED } from "./robots";

/**
 * The four pages worth indexing. Everything else is either signed-in, or names
 * a particular person or property.
 *
 * Empty until launch so a sitemap can't invite crawlers past a robots file
 * that is still turning them away.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!LAUNCHED) return [];

  const base = "https://www.yardtize.com";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/list`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/browse`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/sign-in`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
