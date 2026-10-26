import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { Badge, type Tone } from "./ui/badge";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/server/services/order-state";

const orderTone: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: "yellow",
  PLACED: "brand",
  ACCEPTED: "blue",
  PREPARING: "blue",
  READY_FOR_PICKUP: "purple",
  PICKED_UP: "purple",
  IN_TRANSIT: "purple",
  DELIVERED: "green",
  REJECTED: "red",
  CANCELLED: "red",
};
const payTone: Record<PaymentStatus, Tone> = {
  PENDING: "yellow",
  PROCESSING: "yellow",
  PAID: "green",
  FAILED: "red",
  CANCELLED: "neutral",
  REFUND_PENDING: "purple",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "purple",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTone[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={payTone[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>;
}

export const PAYMENT_METHOD_LABEL = {
  MPESA: "M-Pesa",
  EMOLA: "e-Mola",
  CARD: "Cartão",
  CASH_ON_DELIVERY: "Numerário na entrega",
  TEST: "Teste",
} as const;

export const DELIVERY_MODE_LABEL = { RESTAURANT: "Entrega pelo restaurante", PLATFORM: "Entrega pela plataforma" } as const;

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }, timeZone = "Africa/Maputo") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-PT", { ...opts, timeZone }).format(new Date(d));
}

export const DELIVERY_STATUS_LABEL = {
  SEARCHING: "À procura de entregador",
  ASSIGNED: "Entregador atribuído",
  PICKED_UP: "Recolhido",
  IN_TRANSIT: "A caminho",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelada",
} as const;
