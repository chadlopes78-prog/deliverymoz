import { MapPin } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { centsToInput, formatMoney } from "@/lib/money";
import { DELIVERY_MODE_LABEL } from "@/components/status";
import { zoneAction, zoneDeleteAction } from "../../actions";

export const metadata = { title: "Zonas de entrega" };

export default async function Zones() {
  const ctx = await requirePartner("store.manage");
  const settings = await getSettings();
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId }, include: { city: { include: { neighborhoods: { where: { isActive: true }, orderBy: { name: "asc" } } } }, zones: { include: { neighborhood: true }, orderBy: { neighborhood: { name: "asc" } } } } });
  const available = r.city.neighborhoods.filter((n) => !r.zones.some((z) => z.neighborhoodId === n.id));
  return (
    <>
      <PageHeader title="Zonas de entrega" description={`Bairros de ${r.city.name} atendidos e respetiva taxa de entrega. Modelo atual: ${DELIVERY_MODE_LABEL[r.deliveryMode]}.`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          {r.zones.length === 0 ? <EmptyState icon={MapPin} title="Ainda não definiu zonas de entrega" description="Adicione os bairros onde entrega. Os clientes de outros bairros não podem encomendar." /> : (
            <ul className="space-y-2">
              {r.zones.map((z) => (
                <li key={z.id} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{z.neighborhood.name} {!z.isActive && <span className="text-xs text-muted">(inativa)</span>}</p>
                    <p className="text-sm">{z.feeCents ? formatMoney(z.feeCents, settings.currency) : "Grátis"} · {z.etaMinutes} min</p>
                    <QuickAction action={zoneDeleteAction} hidden={{ id: z.id }} label="Remover" variant="ghost" confirmMessage="Remover esta zona?" />
                  </div>
                  <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary>
                    <ActionForm action={zoneAction} className="mt-2 grid gap-2 sm:grid-cols-3">
                      <input type="hidden" name="neighborhoodId" value={z.neighborhoodId} />
                      <Input name="fee" inputMode="decimal" defaultValue={centsToInput(z.feeCents)} aria-label="Taxa" />
                      <Input name="etaMinutes" type="number" min={5} max={240} defaultValue={z.etaMinutes} aria-label="Tempo estimado" />
                      <Checkbox name="isActive" defaultChecked={z.isActive} label="Ativa" />
                      <SubmitButton size="sm" className="sm:col-span-3">Guardar</SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <CardHeader title="Adicionar bairro" />
          <CardBody>
            {available.length === 0 ? <p className="text-sm text-muted">Todos os bairros disponíveis já estão adicionados. Peça à plataforma para adicionar novos bairros.</p> : (
              <ActionForm action={zoneAction} resetOnSuccess className="space-y-3">
                <Field label="Bairro" htmlFor="zn"><Select id="zn" name="neighborhoodId" required>{available.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select></Field>
                <Field label={`Taxa de entrega (${settings.currency})`} htmlFor="zf" hint="0 para entrega grátis"><Input id="zf" name="fee" inputMode="decimal" required defaultValue="0" /></Field>
                <Field label="Tempo de entrega (min)" htmlFor="ze"><Input id="ze" name="etaMinutes" type="number" min={5} max={240} defaultValue={30} /></Field>
                <SubmitButton className="w-full">Adicionar</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
