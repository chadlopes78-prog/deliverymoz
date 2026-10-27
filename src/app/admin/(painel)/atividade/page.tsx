import { requireAdmin } from "@/server/guards";
import { platformActivity, ACTIVITY_KIND_LABEL, type ActivityKind } from "@/server/services/activity";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Tabs } from "@/components/tabs";
import { RefreshButton } from "@/components/refresh-button";
import { ActivityList } from "@/components/activity-list";

export const metadata = { title: "Atividade da plataforma" };

export default async function PlatformActivity({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "todas" } = await searchParams;
  await requireAdmin("dashboard.view");
  const kind = tab in ACTIVITY_KIND_LABEL ? (tab as ActivityKind) : null;
  const items = await platformActivity({ take: 100, kind });
  return (
    <>
      <PageHeader title="Atividade da plataforma" description="Eventos reais registados pelo servidor: contas, restaurantes, produtos, pedidos e ações administrativas. Nunca inclui palavras-passe, tokens ou dados de pagamento." actions={<RefreshButton />} />
      <Tabs base="/admin/atividade" current={kind ?? "todas"} tabs={[["todas", "Tudo"], ...Object.entries(ACTIVITY_KIND_LABEL)]} />
      <Card><CardBody><ActivityList items={items} empty="Ainda não existe atividade deste tipo." /></CardBody></Card>
    </>
  );
}
