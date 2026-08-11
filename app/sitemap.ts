import type { MetadataRoute } from "next";
import { internships } from "@/lib/internships";

const BASE = "https://www.ambitionangels.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/about", priority: 0.8 },
    { path: "/the-app", priority: 0.8 },
    { path: "/curriculum", priority: 0.8 },
    { path: "/impact", priority: 0.8 },
    { path: "/donate", priority: 0.9 },
    { path: "/for-adults", priority: 0.7 },
    { path: "/founder", priority: 0.5 },
    { path: "/meet", priority: 0.5 },
    { path: "/teens", priority: 0.7 },
    { path: "/teens/built-for", priority: 0.6 },
  ];

  return [
    ...pages.map(({ path, priority }) => ({
      url: `${BASE}${path}`,
      changeFrequency: "monthly" as const,
      priority,
    })),
    ...internships.map((i) => ({
      url: `${BASE}/curriculum/${i.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
