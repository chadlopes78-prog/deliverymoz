import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
import { db } from "@/server/db";
import { getSettingsUncached } from "@/server/services/settings";
import { PUBLIC_RESTAURANT_WHERE } from "@/server/services/availability";

/** Apenas restaurantes e produtos reais e publicados são incluídos. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getSettingsUncached();
  const base = (s.siteUrl || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const restaurants = await db.restaurant.findMany({
    where: PUBLIC_RESTAURANT_WHERE,
    select: { slug: true, updatedAt: true, products: { where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true }, take: 500 } },
    take: 5000,
  });
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/restaurantes`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/ajuda`, priority: 0.3 },
    { url: `${base}/termos`, priority: 0.1 },
    { url: `${base}/privacidade`, priority: 0.1 },
    ...restaurants.flatMap((r) => [
      { url: `${base}/restaurante/${r.slug}`, lastModified: r.updatedAt, changeFrequency: "daily" as const, priority: 0.7 },
      ...r.products.map((p) => ({ url: `${base}/restaurante/${r.slug}/${p.slug}`, lastModified: p.updatedAt, priority: 0.5 })),
    ]),
  ];
}
