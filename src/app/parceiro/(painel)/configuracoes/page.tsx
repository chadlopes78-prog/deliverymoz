import Link from "next/link";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { hasRestaurantPermission, RESTAURANT_ROLE_LABEL } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { payoutAction, switchRestaurantAction } from "../../actions";

export const metadata = { title: "Configurações" };

export default async function PartnerSettings() {
  const ctx = await requirePartner();
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId }, select: { payoutDetails: true, slug: true, status: true } });
  return (
    <>
      <PageHeader title="Configurações" description={`A sua função: ${RESTAURANT_ROLE_LABEL[ctx.role]}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        {ctx.user.restaurantMembers.length > 1 && (
          <Card>
            <CardHeader title="Os meus restaurantes" />
            <CardBody className="space-y-2">
              {ctx.user.restaurantMembers.map((m) => (
                <ActionForm key={m.restaurantId} action={switchRestaurantAction} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                  <input type="hidden" name="restaurantId" value={m.restaurantId} />
                  <span>{m.restaurant.name} <Badge>{RESTAURANT_ROLE_LABEL[m.role]}</Badge></span>
                  {m.restaurantId === ctx.restaurantId ? <Badge tone="green">Ativo</Badge> : <SubmitButton size="sm" variant="outline">Gerir</SubmitButton>}
                </ActionForm>
              ))}
            </CardBody>
          </Card>
        )}
        {hasRestaurantPermission(ctx.role, "payout.manage") && (
          <Card>
            <CardHeader title="Dados para liquidação" description="Ex.: número M-Pesa ou dados bancários (banco, titular, NIB). Visíveis apenas à equipa financeira da plataforma." />
            <CardBody>
              <ActionForm action={payoutAction} className="space-y-3">
                <Textarea name="payoutDetails" defaultValue={r.payoutDetails ?? ""} maxLength={500} aria-label="Dados de liquidação" />
                <SubmitButton>Guardar</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Página pública" />
          <CardBody className="text-sm">
            {r.status === "APPROVED" ? <Link className="font-semibold text-brand" href={`/restaurante/${r.slug}`} target="_blank">Ver a minha página</Link> : <p className="text-muted">Disponível após aprovação.</p>}
            <p className="mt-2 text-muted">As notificações de novos pedidos aparecem no painel e, se configurado, por e-mail. Preferências de e-mail: <Link href="/minha-conta/notificacoes" className="text-brand">Minha conta</Link>.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
