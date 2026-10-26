import { FileText } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { centsToInput } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";
import { DELIVERY_MODE_LABEL, formatDate } from "@/components/status";
import { storeAction, documentAction } from "../../actions";

export const metadata = { title: "Loja" };

export default async function Store() {
  const ctx = await requirePartner("store.manage");
  const [r, cuisines, settings] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId }, include: { cuisines: true, city: { include: { neighborhoods: { where: { isActive: true }, orderBy: { name: "asc" } } } }, documents: { orderBy: { createdAt: "desc" } } } }),
    db.cuisineCategory.findMany({ where: { isActive: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    getSettings(),
  ]);
  const modes = [r.allowRestaurantDelivery && "RESTAURANT", r.allowPlatformDelivery && "PLATFORM"].filter(Boolean) as ("RESTAURANT" | "PLATFORM")[];
  return (
    <>
      <PageHeader title="Loja" description="Informações apresentadas aos clientes." />
      <ActionForm action={storeAction} className="space-y-5">
        <Card>
          <CardHeader title="Identidade" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name"><Input id="name" name="name" defaultValue={r.name} required /></Field>
            <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={r.phone.replace(/^258/, "")} required /></Field>
            <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={r.email ?? ""} /></Field>
            <Field label="Categorias de cozinha (até 5)" htmlFor="cuisineIds" hint="Ctrl/Cmd para selecionar várias">
              <select id="cuisineIds" name="cuisineIds" multiple defaultValue={r.cuisines.map((c) => c.id)} className="h-28 w-full rounded-xl border border-line bg-surface p-2 text-sm">
                {cuisines.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </Field>
            <Field label="Descrição" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={r.description ?? ""} maxLength={1000} /></Field>
            <Field label="Logótipo (quadrado)" htmlFor="logo">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.logoFileId && <img src={fileUrl(r.logoFileId)!} alt="" className="h-14 w-14 rounded-xl object-cover" />}
                <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="py-2" />
              </div>
            </Field>
            <Field label="Imagem de capa (horizontal)" htmlFor="cover">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.coverFileId && <img src={fileUrl(r.coverFileId)!} alt="" className="h-14 w-24 rounded-xl object-cover" />}
                <Input id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="py-2" />
              </div>
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Localização" description={`Cidade: ${r.city.name} (alteração apenas pelo suporte)`} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Bairro" htmlFor="neighborhoodId"><Select id="neighborhoodId" name="neighborhoodId" defaultValue={r.neighborhoodId ?? ""}><option value="">—</option>{r.city.neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</Select></Field>
            <Field label="Endereço" htmlFor="addressLine"><Input id="addressLine" name="addressLine" defaultValue={r.addressLine} required /></Field>
            <Field label="Referência" htmlFor="addressReference" className="sm:col-span-2"><Input id="addressReference" name="addressReference" defaultValue={r.addressReference ?? ""} /></Field>
            <Field label="Latitude (opcional)" htmlFor="latitude"><Input id="latitude" name="latitude" inputMode="decimal" defaultValue={r.latitude ?? ""} /></Field>
            <Field label="Longitude (opcional)" htmlFor="longitude" hint="Usadas no link de navegação dos entregadores"><Input id="longitude" name="longitude" inputMode="decimal" defaultValue={r.longitude ?? ""} /></Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Operação" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Tempo médio de preparação (min)" htmlFor="prepTimeMinutes"><Input id="prepTimeMinutes" name="prepTimeMinutes" type="number" min={5} max={240} defaultValue={r.prepTimeMinutes} /></Field>
            <Field label={`Pedido mínimo (${settings.currency})`} htmlFor="minOrder"><Input id="minOrder" name="minOrder" inputMode="decimal" defaultValue={centsToInput(r.minOrderCents)} /></Field>
            <Field label="Modelo de entrega" htmlFor="deliveryMode" hint="Os modelos disponíveis são definidos pela plataforma.">
              <Select id="deliveryMode" name="deliveryMode" defaultValue={r.deliveryMode}>{modes.map((m) => <option key={m} value={m}>{DELIVERY_MODE_LABEL[m]}</option>)}</Select>
            </Field>
            <Checkbox name="acceptsCashOnDelivery" defaultChecked={r.acceptsCashOnDelivery} label="Aceitar pagamento em numerário na entrega" className="self-end" />
          </CardBody>
        </Card>
        <SubmitButton size="lg">Guardar loja</SubmitButton>
      </ActionForm>

      <Card className="mt-5">
        <CardHeader title="Documentos" description="Ficheiros privados, visíveis apenas à sua equipa e à administração da plataforma." />
        <CardBody>
          {r.documents.length > 0 && <ul className="mb-4 space-y-1 text-sm">{r.documents.map((d) => <li key={d.id}><a href={fileUrl(d.fileId)!} target="_blank" className="inline-flex items-center gap-1 text-brand underline"><FileText className="h-4 w-4" />{d.type}</a> <span className="text-xs text-muted">{formatDate(d.createdAt, { dateStyle: "short" })}</span></li>)}</ul>}
          <ActionForm action={documentAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Tipo" htmlFor="dtype"><Input id="dtype" name="type" placeholder="Ex.: Alvará" required /></Field>
            <Field label="Ficheiro (PDF, JPG, PNG; até 6 MB)" htmlFor="document"><Input id="document" name="document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="py-2" /></Field>
            <SubmitButton variant="outline">Enviar</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
