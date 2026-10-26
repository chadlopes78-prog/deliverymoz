import { isOpenAt, type Hour } from "@/lib/hours";

type RestaurantLike = {
  status: string;
  acceptingOrders: boolean;
  hours: Hour[];
};

export type Availability =
  | { orderable: true; label: "Aberto" }
  | { orderable: false; label: string; reason: "NOT_APPROVED" | "PAUSED" | "CLOSED" | "NO_HOURS" };

export function restaurantAvailability(r: RestaurantLike, timeZone: string, now = new Date()): Availability {
  if (r.status !== "APPROVED") return { orderable: false, label: "Indisponível", reason: "NOT_APPROVED" };
  if (!r.hours.length) return { orderable: false, label: "Horário não definido", reason: "NO_HOURS" };
  if (!r.acceptingOrders) return { orderable: false, label: "Pausado", reason: "PAUSED" };
  if (!isOpenAt(r.hours, now, timeZone)) return { orderable: false, label: "Fechado", reason: "CLOSED" };
  return { orderable: true, label: "Aberto" };
}

/** Condição para um restaurante aparecer publicamente: aprovado e com configuração mínima completa. */
export const PUBLIC_RESTAURANT_WHERE = {
  status: "APPROVED" as const,
  hours: { some: {} },
  zones: { some: { isActive: true } },
  products: { some: { status: "ACTIVE" as const } },
};
