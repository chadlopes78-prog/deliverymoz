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
