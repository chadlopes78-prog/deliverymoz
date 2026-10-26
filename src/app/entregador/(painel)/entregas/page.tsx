import { Bike, MapPin, Phone, Store, Navigation, AlertTriangle } from "lucide-react";
import { requireCourierUser } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { Countdown } from "@/components/courier/countdown";
import { LocationSharer } from "@/components/courier/location-sharer";
import { OrderStatusBadge, PAYMENT_METHOD_LABEL } from "@/components/status";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/utils";
import { acceptOfferAction, declineOfferAction, advanceAction, issueAction, locationConsentAction } from "../../actions";

export const metadata = { title: "Entregas" };

/** Link de navegação (formato público de URL do Google Maps, sem chave de API). */
function mapsLink(lat: number | null, lng: number | null, text: string) {
  const dest = lat != null && lng != null ? `${lat},${lng}` : text;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export default async function CourierDeliveries() {
  const user = await requireCourierUser();
  const courier = await db.courier.findUniqueOrThrow({ where: { userId: user.id } });
  const settings = await getSettings();
  const consent = (await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { locationConsentAt: true } })).locationConsentAt;
  const active = await db.delivery.findFirst({
    where: { courierId: courier.id, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } },
    include: { order: { include: { items: true, restaurant: { select: { name: true, phone: true, addressLine: true, addressReference: true, latitude: true, longitude: true, neighborhood: { select: { name: true } } } } } } },
  });
  const offers = active ? [] : await db.deliveryOffer.findMany({
    where: { courierId: courier.id, status: "OFFERED", expiresAt: { gt: new Date() } },
    include: { delivery: { include: { order: { select: { code: true, neighborhoodName: true, status: true, paymentMethod: true, totalCents: true, currency: true, restaurant: { select: { name: true, neighborhood: { select: { name: true } } } }, _count: { select: { items: true } } } } } } },
    orderBy: { expiresAt: "asc" },
  });

  if (courier.status !== "APPROVED") return <EmptyState icon={Bike} title="Conta ainda não aprovada" description="As entregas ficam disponíveis após a aprovação." />;

  return (
    <>
      <AutoRefresh seconds={active ? 30 : 8} />
      <PageHeader title={active ? "Entrega em curso" : "Ofertas de entrega"} description={active ? undefined : courier.isAvailable ? "Atualiza automaticamente." : "Está indisponível. Fique disponível no ecrã inicial para receber ofertas."} />
      {active ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between"><p className="font-mono text-lg font-bold">#{active.order.code}</p><OrderStatusBadge status={active.order.status} /></div>
            <p className="mt-1 text-sm">Ganho desta entrega: <strong>{formatMoney(active.courierFeeCents, settings.currency)}</strong></p>
            {active.order.paymentMethod === "CASH_ON_DELIVERY" && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Cobrar ao cliente: {formatMoney(active.order.totalCents, active.order.currency)} em numerário</p>}
          </div>
          <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><Store className="h-4 w-4" /> 1. Recolher em {active.order.restaurant.name}</h2>
            <p>{active.order.restaurant.addressLine}{active.order.restaurant.neighborhood ? `, ${active.order.restaurant.neighborhood.name}` : ""}</p>
            {active.order.restaurant.addressReference && <p className="text-muted">Ref.: {active.order.restaurant.addressReference}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={mapsLink(active.order.restaurant.latitude, active.order.restaurant.longitude, `${active.order.restaurant.addressLine}, ${active.order.cityName}`)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}><Navigation className="h-4 w-4" /> Navegar</a>
              <a href={`tel:+${active.order.restaurant.phone}`} className={buttonClass("outline", "sm")}><Phone className="h-4 w-4" /> Ligar</a>
            </div>
            <ul className="mt-3 border-t border-line pt-2 text-xs text-muted">{active.order.items.map((it) => <li key={it.id}>{it.quantity}× {it.productName}</li>)}</ul>
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> 2. Entregar a {active.order.customerName}</h2>
            <p>{active.order.street}, {active.order.neighborhoodName}, {active.order.cityName}</p>
            {active.order.addressReference && <p className="text-muted">Ref.: {active.order.addressReference}</p>}
            {active.order.notesForDelivery && <p className="mt-1 rounded-lg bg-ink/5 p-2">Nota: {active.order.notesForDelivery}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={mapsLink(active.order.latitude, active.order.longitude, `${active.order.street}, ${active.order.neighborhoodName}, ${active.order.cityName}`)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}><Navigation className="h-4 w-4" /> Navegar</a>
              <a href={`tel:+${active.order.customerPhone}`} className={buttonClass("outline", "sm")}><Phone className="h-4 w-4" /> {formatPhone(active.order.customerPhone)}</a>
            </div>
          </section>

          <div className="sticky bottom-20 z-10 space-y-2 rounded-2xl border border-line bg-surface p-3 shadow-lg lg:bottom-4">
            {active.order.status === "READY_FOR_PICKUP" || active.order.status === "ACCEPTED" || active.order.status === "PREPARING" ? (
              active.order.status === "READY_FOR_PICKUP"
                ? <QuickAction action={advanceAction} hidden={{ deliveryId: active.id, to: "PICKED_UP" }} label="Confirmar recolha" variant="accent" size="md" />
                : <p className="text-sm text-muted">A aguardar que o restaurante marque o pedido como pronto…</p>
            ) : null}
            {active.order.status === "PICKED_UP" && <QuickAction action={advanceAction} hidden={{ deliveryId: active.id, to: "IN_TRANSIT" }} label="Iniciar trajeto até ao cliente" variant="accent" size="md" />}
            {(active.order.status === "PICKED_UP" || active.order.status === "IN_TRANSIT") && (
              <ActionForm action={advanceAction} className="space-y-2" confirmMessage="Confirmar que o pedido foi entregue ao cliente?">
                <input type="hidden" name="deliveryId" value={active.id} /><input type="hidden" name="to" value="DELIVERED" />
                {active.order.paymentMethod === "CASH_ON_DELIVERY" && <Checkbox name="cashCollected" required label={`Recebi ${formatMoney(active.order.totalCents, active.order.currency)} em numerário`} />}
                <SubmitButton className="w-full" variant="accent" size="lg">Confirmar entrega</SubmitButton>
              </ActionForm>
            )}
            {consent ? <LocationSharer active /> : (
              <ActionForm action={locationConsentAction} className="text-xs" hideMessage>
                <input type="hidden" name="consent" value="true" />
                <p className="text-muted">Partilhar a sua localização com o cliente durante esta entrega? Só é partilhada enquanto tiver uma entrega ativa.</p>
                <SubmitButton size="sm" variant="outline" className="mt-1">Autorizar partilha de localização</SubmitButton>
              </ActionForm>
            )}
          </div>

          <details className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" /> Reportar problema</summary>
            <ActionForm action={issueAction} resetOnSuccess className="mt-3 space-y-2">
              <input type="hidden" name="deliveryId" value={active.id} />
              <Select name="type" aria-label="Tipo de problema"><option value="CLIENTE_AUSENTE">Cliente não atende / ausente</option><option value="ENDERECO">Endereço não encontrado</option><option value="ATRASO_RESTAURANTE">Atraso no restaurante</option><option value="ACIDENTE">Acidente / avaria</option><option value="OUTRO">Outro</option></Select>
              <Textarea name="description" required placeholder="Descreva o que aconteceu" aria-label="Descrição" />
              <SubmitButton size="sm" variant="outline">Enviar</SubmitButton>
            </ActionForm>
          </details>
        </div>
      ) : offers.length === 0 ? (
        <EmptyState icon={Bike} title="Sem ofertas de momento" description={courier.isAvailable ? "Novas ofertas aparecem aqui automaticamente." : "Fique disponível para começar a receber ofertas."} />
      ) : (
        <ul className="space-y-3">
          {offers.map((of) => (
            <li key={of.id} className="rounded-2xl border-2 border-brand/40 bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-2"><p className="font-mono font-bold">#{of.delivery.order.code}</p><Countdown until={of.expiresAt.toISOString()} /></div>
              <p className="mt-2"><Store className="mr-1 inline h-4 w-4" />{of.delivery.order.restaurant.name}{of.delivery.order.restaurant.neighborhood ? ` (${of.delivery.order.restaurant.neighborhood.name})` : ""}</p>
              <p><MapPin className="mr-1 inline h-4 w-4" />Entrega em {of.delivery.order.neighborhoodName}</p>
              <p className="mt-1 text-muted">{of.delivery.order._count.items} item(ns) · {PAYMENT_METHOD_LABEL[of.delivery.order.paymentMethod]}</p>
              <div className="mt-2 flex items-center justify-between"><span>Ganho: <strong>{formatMoney(of.delivery.courierFeeCents, settings.currency)}</strong></span><Badge>{of.delivery.order.status === "READY_FOR_PICKUP" ? "Pronto" : "Em preparação"}</Badge></div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <QuickAction action={declineOfferAction} hidden={{ offerId: of.id }} label="Recusar" size="md" />
                <QuickAction action={acceptOfferAction} hidden={{ offerId: of.id }} label="Aceitar" variant="accent" size="md" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
