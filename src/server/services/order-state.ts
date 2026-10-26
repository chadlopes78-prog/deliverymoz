import type { DeliveryMode, OrderStatus } from "@prisma/client";

/**
 * Máquina de estados dos pedidos.
 *
 * PENDING_PAYMENT → PLACED            (sistema, após confirmação validada do pagamento online)
 * PENDING_PAYMENT → CANCELLED         (cliente, sistema por expiração, admin)
 * PLACED          → ACCEPTED|REJECTED (restaurante)
 * PLACED          → CANCELLED         (cliente antes da aceitação, admin)
 * ACCEPTED        → PREPARING         (restaurante)
 * ACCEPTED|PREPARING → READY_FOR_PICKUP (restaurante)
 * ACCEPTED|PREPARING → CANCELLED      (restaurante com motivo, admin)
 * READY_FOR_PICKUP → PICKED_UP        (entregador atribuído ou restaurante, conforme o modelo de entrega)
 * PICKED_UP → IN_TRANSIT → DELIVERED  (quem faz a entrega)
 * READY_FOR_PICKUP|PICKED_UP|IN_TRANSIT → CANCELLED (apenas admin, com motivo)
 *
 * Estados finais: DELIVERED, REJECTED, CANCELLED.
 * Reembolsos são acompanhados pelo estado de pagamento (REFUND_PENDING / REFUNDED).
 */
export type ActorRole = "CUSTOMER" | "RESTAURANT" | "COURIER" | "ADMIN" | "SYSTEM";

type Rule = { to: OrderStatus; roles: ActorRole[]; deliveryMode?: DeliveryMode; requiresReason?: boolean };

const RULES: Record<OrderStatus, Rule[]> = {
  PENDING_PAYMENT: [
    { to: "PLACED", roles: ["SYSTEM"] },
    { to: "CANCELLED", roles: ["CUSTOMER", "SYSTEM", "ADMIN"] },
  ],
  PLACED: [
    { to: "ACCEPTED", roles: ["RESTAURANT", "ADMIN"] },
    { to: "REJECTED", roles: ["RESTAURANT"], requiresReason: true },
    { to: "CANCELLED", roles: ["CUSTOMER", "ADMIN", "SYSTEM"], requiresReason: true },
  ],
  ACCEPTED: [
    { to: "PREPARING", roles: ["RESTAURANT", "ADMIN"] },
    { to: "READY_FOR_PICKUP", roles: ["RESTAURANT", "ADMIN"] },
    { to: "CANCELLED", roles: ["RESTAURANT", "ADMIN"], requiresReason: true },
  ],
  PREPARING: [
    { to: "READY_FOR_PICKUP", roles: ["RESTAURANT", "ADMIN"] },
    { to: "CANCELLED", roles: ["RESTAURANT", "ADMIN"], requiresReason: true },
  ],
  READY_FOR_PICKUP: [
    { to: "PICKED_UP", roles: ["COURIER", "ADMIN"], deliveryMode: "PLATFORM" },
    { to: "PICKED_UP", roles: ["RESTAURANT", "ADMIN"], deliveryMode: "RESTAURANT" },
    { to: "CANCELLED", roles: ["ADMIN"], requiresReason: true },
  ],
  PICKED_UP: [
    { to: "IN_TRANSIT", roles: ["COURIER", "ADMIN"], deliveryMode: "PLATFORM" },
    { to: "IN_TRANSIT", roles: ["RESTAURANT", "ADMIN"], deliveryMode: "RESTAURANT" },
    { to: "DELIVERED", roles: ["COURIER", "ADMIN"], deliveryMode: "PLATFORM" },
    { to: "DELIVERED", roles: ["RESTAURANT", "ADMIN"], deliveryMode: "RESTAURANT" },
    { to: "CANCELLED", roles: ["ADMIN"], requiresReason: true },
  ],
  IN_TRANSIT: [
    { to: "DELIVERED", roles: ["COURIER", "ADMIN"], deliveryMode: "PLATFORM" },
    { to: "DELIVERED", roles: ["RESTAURANT", "ADMIN"], deliveryMode: "RESTAURANT" },
    { to: "CANCELLED", roles: ["ADMIN"], requiresReason: true },
  ],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const FINAL_STATUSES: OrderStatus[] = ["DELIVERED", "REJECTED", "CANCELLED"];
export const ACTIVE_STATUSES: OrderStatus[] = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
];

export function findTransition(
  from: OrderStatus,
  to: OrderStatus,
  role: ActorRole,
  deliveryMode: DeliveryMode,
): Rule | null {
  return (
    RULES[from].find(
      (r) => r.to === to && r.roles.includes(role) && (!r.deliveryMode || r.deliveryMode === deliveryMode),
    ) ?? null
  );
}

export function allowedNextStatuses(from: OrderStatus, role: ActorRole, deliveryMode: DeliveryMode): OrderStatus[] {
  return [
    ...new Set(
      RULES[from]
        .filter((r) => r.roles.includes(role) && (!r.deliveryMode || r.deliveryMode === deliveryMode))
        .map((r) => r.to),
    ),
  ];
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "A aguardar pagamento",
  PLACED: "Pedido recebido",
  ACCEPTED: "Pedido confirmado",
  PREPARING: "Em preparação",
  READY_FOR_PICKUP: "Pronto para recolha",
  PICKED_UP: "Pedido recolhido",
  IN_TRANSIT: "A caminho",
  DELIVERED: "Entregue",
  REJECTED: "Recusado pelo restaurante",
  CANCELLED: "Cancelado",
};

export const PAYMENT_STATUS_LABEL = {
  PENDING: "Pendente",
  PROCESSING: "Em processamento",
  PAID: "Pago",
  FAILED: "Falhado",
  CANCELLED: "Cancelado",
  REFUND_PENDING: "Reembolso pendente",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Parcialmente reembolsado",
} as const;
