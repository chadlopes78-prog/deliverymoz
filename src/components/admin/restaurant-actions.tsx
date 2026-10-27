import type { RestaurantStatus } from "@prisma/client";
import { QuickAction, ReasonForm } from "@/components/reason-form";
import { restaurantStatusAction, adminRestaurantPauseAction, adminRestaurantListAction } from "@/app/admin/actions";

/** Ativar, pausar, suspender, aprovar ou rejeitar um restaurante (lista e ficha). */
export function RestaurantStatusActions({ r }: { r: { id: string; name: string; status: RestaurantStatus; acceptingOrders: boolean; isListed: boolean } }) {
  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {r.status === "PENDING" && <QuickAction action={restaurantStatusAction} hidden={{ id: r.id, status: "APPROVED" }} label="Aprovar" variant="accent" confirmMessage={`Aprovar ${r.name}?`} />}
      {r.status === "PENDING" && <ReasonForm action={restaurantStatusAction} hidden={{ id: r.id, status: "REJECTED" }} label="Rejeitar" variant="danger" placeholder="Motivo da rejeição (enviado ao restaurante)" />}
      {(r.status === "SUSPENDED" || r.status === "REJECTED") && <QuickAction action={restaurantStatusAction} hidden={{ id: r.id, status: "APPROVED" }} label={r.status === "SUSPENDED" ? "Reativar" : "Aprovar"} variant="accent" confirmMessage={`Reativar ${r.name}?`} />}
      {r.status === "APPROVED" && (r.acceptingOrders
        ? <QuickAction action={adminRestaurantPauseAction} hidden={{ id: r.id, accepting: "" }} label="Pausar" confirmMessage={`Pausar ${r.name}? Deixa de receber pedidos até ser ativado.`} />
        : <QuickAction action={adminRestaurantPauseAction} hidden={{ id: r.id, accepting: "on" }} label="Ativar" variant="accent" />)}
      {r.status === "APPROVED" && (r.isListed
        ? <QuickAction action={adminRestaurantListAction} hidden={{ id: r.id, listed: "" }} label="Despublicar" variant="ghost" confirmMessage={`Despublicar ${r.name}? Deixa de aparecer no site até voltar a ser publicado.`} />
        : <QuickAction action={adminRestaurantListAction} hidden={{ id: r.id, listed: "on" }} label="Publicar" variant="accent" />)}
      {r.status === "APPROVED" && <ReasonForm action={restaurantStatusAction} hidden={{ id: r.id, status: "SUSPENDED" }} label="Suspender" variant="danger" placeholder="Motivo da suspensão" />}
    </div>
  );
}
