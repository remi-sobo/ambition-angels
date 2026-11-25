import type { MetadataRoute } from "next";

// BloomOS is a signed-in app. Nothing on it belongs in search results.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
