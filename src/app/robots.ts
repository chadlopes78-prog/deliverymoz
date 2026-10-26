import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
import { getSettingsUncached } from "@/server/services/settings";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const s = await getSettingsUncached();
  const base = (s.siteUrl || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/parceiro", "/entregador", "/minha-conta", "/checkout", "/sacola", "/acompanhar", "/api", "/configuracao"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
