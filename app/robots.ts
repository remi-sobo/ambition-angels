import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/auth", "/demo"],
    },
    sitemap: "https://www.ambitionangels.org/sitemap.xml",
  };
}
