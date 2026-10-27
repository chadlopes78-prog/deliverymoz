import type { RestaurantStatus, CourierStatus, UserStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

export const RESTAURANT_STATUS_LABEL: Record<RestaurantStatus, string> = { PENDING: "Pendente", APPROVED: "Aprovado", REJECTED: "Rejeitado", SUSPENDED: "Suspenso" };
export function RestaurantStatusBadge({ status }: { status: RestaurantStatus }) {
  return <Badge tone={{ PENDING: "yellow", APPROVED: "green", REJECTED: "red", SUSPENDED: "red" }[status] as "yellow"}>{RESTAURANT_STATUS_LABEL[status]}</Badge>;
}
export const COURIER_STATUS_LABEL: Record<CourierStatus, string> = { PENDING: "Pendente", APPROVED: "Aprovado", REJECTED: "Rejeitado", SUSPENDED: "Suspenso" };
export function CourierStatusBadge({ status }: { status: CourierStatus }) {
  return <Badge tone={{ PENDING: "yellow", APPROVED: "green", REJECTED: "red", SUSPENDED: "red" }[status] as "yellow"}>{COURIER_STATUS_LABEL[status]}</Badge>;
}
export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge tone={{ ACTIVE: "green", SUSPENDED: "red", CLOSED: "neutral" }[status] as "green"}>{{ ACTIVE: "Ativa", SUSPENDED: "Suspensa", CLOSED: "Encerrada" }[status]}</Badge>;
}

/** Estado operacional: aprovado e a aceitar pedidos = ativo; aprovado sem aceitar pedidos = pausado. */
export function RestaurantOperationalBadge({ status, acceptingOrders }: { status: RestaurantStatus; acceptingOrders: boolean }) {
  if (status === "APPROVED") return <Badge tone={acceptingOrders ? "green" : "yellow"}>{acceptingOrders ? "Ativo" : "Pausado"}</Badge>;
  return <RestaurantStatusBadge status={status} />;
}
