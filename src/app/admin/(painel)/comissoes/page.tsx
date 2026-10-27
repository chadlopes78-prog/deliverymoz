import Link from "next/link";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { resolveCommission } from "@/server/services/commission";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/components/status";
import { formatMoney } from "@/lib/money";
import { commissionAction } from "@/app/admin/actions";

export const metadata = { title: "Comissões" };

export default async function Commissions() {
  await requireAdmin("commissions.manage");
  const [settings, rules, restaurants] = await Promise.all([
    getSettings(),
    db.commissionRule.findMany({ orderBy: [{ effectiveFrom: "desc" }], take: 100, include: { restaurant: { select: { id: true, name: true } } } }),
    db.restaurant.findMany({ where: { status: { in: ["APPROVED", "PENDING", "SUSPENDED"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const global = await resolveCommission("__global__");
  const now = new Date();
  return (
    <>
      <PageHeader title="Comissões" description="A comissão aplicável é registada em cada pedido no momento da criação: alterações futuras não alteram pedidos anteriores." />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Histórico de regras" description={`Comissão global em vigor: ${(global.bps / 100).toFixed(2)}%${global.fixedCents ? ` + ${formatMoney(global.fixedCents, settings.currency)}` : ""}${global.source === "DEFAULT" ? " (valor por omissão das configurações)" : ""}`} />
          <CardBody>
            {rules.length === 0 ? <p className="text-sm text-muted">Ainda não existem regras. É usado o valor por omissão ({(settings.defaultCommissionBps / 100).toFixed(2)}%) definido nas configurações.</p> : (
              <ul className="divide-y divide-line text-sm">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="font-semibold">{r.restaurant ? <Link className="hover:text-brand" href={`/admin/restaurantes/${r.restaurant.id}`}>{r.restaurant.name}</Link> : "Global"}</span>
                    <span className="tabular-nums">{(r.percentageBps / 100).toFixed(2)}%{r.fixedCents ? ` + ${formatMoney(r.fixedCents, settings.currency)}` : ""}</span>
                    <span className="text-muted">desde {formatDate(r.effectiveFrom, undefined, settings.timezone)}</span>
                    {r.effectiveFrom > now && <Badge tone="blue">Agendada</Badge>}
                    {r.note && <span className="w-full text-xs text-muted">{r.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Nova regra" />
          <CardBody>
            <ActionForm action={commissionAction} className="space-y-3" resetOnSuccess>
              <Field label="Aplicar a" htmlFor="restaurantId">
                <Select id="restaurantId" name="restaurantId">
                  <option value="">Todos os restaurantes (global)</option>
                  {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
              <Field label="Percentagem (%)" htmlFor="percentage"><Input id="percentage" name="percentage" inputMode="decimal" required placeholder="Ex.: 12,5" /></Field>
              <Field label={`Valor fixo por pedido (${settings.currency})`} htmlFor="fixed" hint="Opcional"><Input id="fixed" name="fixed" inputMode="decimal" placeholder="0" /></Field>
              <Field label="Início da regra" htmlFor="effectiveFrom" hint="Vazio = imediatamente"><Input id="effectiveFrom" name="effectiveFrom" type="datetime-local" /></Field>
              <Field label="Nota" htmlFor="note"><Input id="note" name="note" maxLength={200} /></Field>
              <SubmitButton className="w-full">Criar regra</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
