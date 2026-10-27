import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { getGeography } from "@/server/location";
import { getSettings } from "@/server/services/settings";
import { restaurantReadiness } from "@/server/services/restaurants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { CityNeighborhoodSelect } from "@/components/city-neighborhood";
import { HoursEditor } from "@/components/partner/hours-editor";
import { GeoFields } from "@/components/admin/geo-fields";
import { ImageField } from "@/components/admin/image-field";
import { RestaurantOperationalBadge } from "@/components/admin/restaurant-status";
import { RestaurantStatusActions } from "@/components/admin/restaurant-actions";
import { centsToInput, formatMoney } from "@/lib/money";
import { minutesToTime } from "@/lib/utils";
import { fileUrl } from "@/server/storage/files";
import { adminRestaurantUpdateAction, adminHoursAction, adminZoneAction, adminZoneDeleteAction } from "@/app/admin/actions";

export const metadata = { title: "Editar restaurante" };

export default async function EditRestaurant({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin("restaurants.manage");
  const r = await db.restaurant.findUnique({
    where: { id },
    include: {
      hours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] },
      zones: { include: { neighborhood: true }, orderBy: { neighborhood: { name: "asc" } } },
      city: { include: { neighborhoods: { where: { isActive: true }, orderBy: { name: "asc" } } } },
    },
  });
  if (!r) notFound();
  const [geography, settings, readiness] = await Promise.all([getGeography(), getSettings(), restaurantReadiness(r.id)]);
  const cur = settings.currency;
  const hours = Array.from({ length: 7 }, (_, d) => r.hours.filter((h) => h.dayOfWeek === d).map((h) => ({ opens: minutesToTime(h.opensAt), closes: minutesToTime(h.closesAt) })));
  const available = r.city.neighborhoods.filter((n) => !r.zones.some((z) => z.neighborhoodId === n.id));
  return (
    <div className="max-w-4xl">
      <Link href={`/admin/restaurantes/${r.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Detalhes do restaurante</Link>
      <PageHeader title={`Editar ${r.name}`} description="As alterações ficam gravadas na base de dados e refletem-se no site público." actions={<RestaurantOperationalBadge status={r.status} acceptingOrders={r.acceptingOrders} />} />

      <Card className="mb-5">
        <CardHeader title="Estado" description={readiness.ready ? "Publicado: o restaurante aparece aos clientes." : `Não publicado. Em falta: ${readiness.items.filter((i) => !i.done).map((i) => i.label.toLowerCase()).join(", ")}.`} />
        <CardBody><RestaurantStatusActions r={r} /></CardBody>
      </Card>

      <ActionForm action={adminRestaurantUpdateAction} className="space-y-5">
        <input type="hidden" name="id" value={r.id} />
        <Card>
          <CardHeader title="Dados do restaurante" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome comercial" htmlFor="name"><Input id="name" name="name" defaultValue={r.name} required minLength={2} maxLength={120} /></Field>
            <Field label="Nome do responsável" htmlFor="responsibleName"><Input id="responsibleName" name="responsibleName" defaultValue={r.responsibleName} required minLength={2} /></Field>
            <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={r.phone} required /></Field>
            <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={r.email ?? ""} /></Field>
            <Field label="Descrição" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={r.description ?? ""} maxLength={1000} /></Field>
            <CityNeighborhoodSelect geography={geography} defaultCityId={r.cityId} defaultNeighborhoodId={r.neighborhoodId} idPrefix="er" />
            <Field label="Endereço" htmlFor="addressLine"><Input id="addressLine" name="addressLine" defaultValue={r.addressLine} required /></Field>
            <Field label="Referência" htmlFor="addressReference"><Input id="addressReference" name="addressReference" defaultValue={r.addressReference ?? ""} /></Field>
            <GeoFields latitude={r.latitude} longitude={r.longitude} />
            <Field label="Denominação social" htmlFor="legalName"><Input id="legalName" name="legalName" defaultValue={r.legalName ?? ""} /></Field>
            <Field label="NUIT" htmlFor="nuit"><Input id="nuit" name="nuit" inputMode="numeric" defaultValue={r.nuit ?? ""} /></Field>
            <Field label="Tempo médio de preparação (min)" htmlFor="prepTimeMinutes"><Input id="prepTimeMinutes" name="prepTimeMinutes" type="number" min={5} max={240} defaultValue={r.prepTimeMinutes} /></Field>
            <Field label={`Pedido mínimo (${cur})`} htmlFor="minOrder"><Input id="minOrder" name="minOrder" inputMode="decimal" defaultValue={centsToInput(r.minOrderCents)} /></Field>
            <Checkbox name="acceptsCashOnDelivery" defaultChecked={r.acceptsCashOnDelivery} label="Aceita pagamento em numerário na entrega" />
            {geography.length > 1 && <p className="text-xs text-muted sm:col-span-2">Ao mudar de cidade, as zonas de entrega atuais são removidas (os bairros pertencem à cidade).</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Imagens" description="Escolha os ficheiros no dispositivo. São convertidos para WebP e guardados sem metadados." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <ImageField name="logo" label="Logótipo" currentUrl={fileUrl(r.logoFileId)} />
            <ImageField name="cover" label="Capa" currentUrl={fileUrl(r.coverFileId)} wide />
          </CardBody>
        </Card>
        <SubmitButton size="lg" pendingText="A guardar…">Guardar restaurante</SubmitButton>
      </ActionForm>

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-bold">Horário de funcionamento</h2>
        <p className="mb-3 text-sm text-muted">Fora deste horário o restaurante aparece como fechado.</p>
        <HoursEditor action={adminHoursAction} initial={hours} hidden={{ restaurantId: r.id }} />
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-bold">Zonas de entrega</h2>
        <p className="mb-3 text-sm text-muted">Bairros de {r.city.name} atendidos, com taxa e tempo estimado.</p>
        <div className="grid gap-5 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
          <div>
            {r.zones.length === 0 ? <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Ainda não há zonas de entrega. Sem zonas, os clientes não podem encomendar.</p> : (
              <ul className="space-y-2">
                {r.zones.map((z) => (
                  <li key={z.id} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{z.neighborhood.name} {!z.isActive && <Badge>Inativa</Badge>}</p>
                      <p className="text-sm">{z.feeCents ? formatMoney(z.feeCents, cur) : "Grátis"} · {z.etaMinutes} min</p>
                      <QuickAction action={adminZoneDeleteAction} hidden={{ id: z.id, restaurantId: r.id }} label="Remover" variant="ghost" confirmMessage="Remover esta zona?" />
                    </div>
                    <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary>
                      <ActionForm action={adminZoneAction} className="mt-2 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="restaurantId" value={r.id} />
                        <input type="hidden" name="neighborhoodId" value={z.neighborhoodId} />
                        <input type="hidden" name="hasActive" value="1" />
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
              {available.length === 0 ? <p className="text-sm text-muted">{r.city.neighborhoods.length === 0 ? "A cidade não tem bairros. Adicione-os em Configurações → Localizações." : "Todos os bairros já estão adicionados."}</p> : (
                <ActionForm action={adminZoneAction} resetOnSuccess className="space-y-3">
                  <input type="hidden" name="restaurantId" value={r.id} />
                  <Field label="Bairro" htmlFor="zn"><Select id="zn" name="neighborhoodId" required>{available.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select></Field>
                  <Field label={`Taxa de entrega (${cur})`} htmlFor="zf" hint="0 para entrega grátis"><Input id="zf" name="fee" inputMode="decimal" required defaultValue="0" /></Field>
                  <Field label="Tempo de entrega (min)" htmlFor="ze"><Input id="ze" name="etaMinutes" type="number" min={5} max={240} defaultValue={30} /></Field>
                  <SubmitButton className="w-full">Adicionar zona</SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}
