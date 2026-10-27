import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Banners } from "../promocoes/banners";

export const metadata = { title: "Banners" };

export default async function BannersPage() {
  await requireAdmin("marketing.manage");
  const [settings, cities] = await Promise.all([getSettings(), db.city.findMany({ orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="Banners" description="Banners da página inicial, por cidade e período." />
      <Banners cities={cities} tz={settings.timezone} />
    </>
  );
}
