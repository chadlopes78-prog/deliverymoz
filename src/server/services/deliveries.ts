import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin, assertApprovedCourier } from "../authz";
import { getSettingsUncached } from "./settings";
import { notifyUsers, adminUserIds } from "./notifications";
import { transitionOrder } from "./orders";
import type { OrderStatus } from "@prisma/client";

/**
 * Envia ofertas de uma entrega a entregadores aprovados, disponíveis, da mesma cidade,
 * sem entrega ativa e que ainda não receberam/recusaram esta entrega.
 */
export async function dispatchDelivery(deliveryId: string) {
  const delivery = await db.delivery.findUnique({ where: { id: deliveryId }, include: { order: { select: { code: true, status: true } } } });
  if (!delivery || delivery.status !== "SEARCHING") return { offered: 0 };
  const settings = await getSettingsUncached();
  const expiresAt = new Date(Date.now() + settings.deliveryOfferTimeoutSec * 1000);

  const candidates = await db.courier.findMany({
    where: {
      status: "APPROVED",
      isAvailable: true,
      cityId: delivery.cityId,
      user: { status: "ACTIVE" },
      deliveries: { none: { status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } } },
      offers: { none: { deliveryId } },
    },
    select: { id: true, userId: true },
    take: 50,
  });
  if (candidates.length) {
    await db.deliveryOffer.createMany({
      data: candidates.map((c) => ({ deliveryId, courierId: c.id, expiresAt })),
      skipDuplicates: true,
    });
    await db.delivery.update({ where: { id: deliveryId }, data: { dispatchRound: { increment: 1 } } });
    await notifyUsers(candidates.map((c) => c.userId), {
      type: "DELIVERY_OFFER",
      title: "Nova oferta de entrega",
      body: `Pedido #${delivery.order.code} disponível para entrega.`,
      link: "/entregador/entregas",
    });
  }
  return { offered: candidates.length };
}

/** Reenvia ofertas expiradas (nova ronda) para entregas ainda sem entregador. Alerta admin quando não há ninguém. */
export async function redispatchStale() {
  const now = new Date();
  await db.deliveryOffer.updateMany({ where: { status: "OFFERED", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  const searching = await db.delivery.findMany({
    where: { status: "SEARCHING", order: { status: { in: ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] } } },
    include: { offers: { where: { status: "OFFERED" } }, order: { select: { code: true } } },
    take: 100,
  });
  let alerted = 0;
  for (const d of searching) {
    if (d.offers.length) continue;
    // Nova ronda: entregadores que deixaram expirar podem voltar a receber a oferta.
    await db.deliveryOffer.deleteMany({ where: { deliveryId: d.id, status: "EXPIRED" } });
    const r = await dispatchDelivery(d.id);
    if (r.offered === 0 && d.dispatchRound > 0 && d.dispatchRound % 5 === 0) {
      alerted++;
      await notifyUsers(await adminUserIds(["OPERATIONS"]), {
        type: "DELIVERY_NO_COURIER",
        title: "Entrega sem entregador",
        body: `O pedido #${d.order.code} continua sem entregador disponível.`,
        link: "/admin/entregas",
      });
    }
  }
  return { searching: searching.length, alerted };
}

export async function setCourierAvailability(userId: string, available: boolean) {
  const courier = await assertApprovedCourier(userId);
  await db.courier.update({ where: { id: courier.id }, data: { isAvailable: available } });
  if (available) {
    const open = await db.delivery.findMany({ where: { status: "SEARCHING", cityId: courier.cityId }, select: { id: true } });
    for (const d of open) await dispatchDelivery(d.id);
  } else {
    await db.deliveryOffer.updateMany({ where: { courierId: courier.id, status: "OFFERED" }, data: { status: "CANCELLED" } });
  }
}

/** Aceitação atómica: apenas um entregador consegue ficar com a entrega. */
export async function acceptOffer(userId: string, offerId: string) {
  const courier = await assertApprovedCourier(userId);
  const offer = await db.deliveryOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.courierId !== courier.id) throw new AppError("NOT_FOUND", "Oferta não encontrada.");
  if (offer.status !== "OFFERED") throw new AppError("CONFLICT", "Esta oferta já não está disponível.");
  if (offer.expiresAt < new Date()) throw new AppError("CONFLICT", "O prazo de aceitação expirou.");
  const active = await db.delivery.count({ where: { courierId: courier.id, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } } });
  if (active > 0) throw new AppError("CONFLICT", "Conclua a entrega atual antes de aceitar outra.");

  await db.$transaction(async (tx) => {
    const claimed = await tx.delivery.updateMany({
      where: { id: offer.deliveryId, status: "SEARCHING", courierId: null },
      data: { status: "ASSIGNED", courierId: courier.id, assignedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError("CONFLICT", "Outro entregador já aceitou esta entrega.");
    await tx.deliveryOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    await tx.deliveryOffer.updateMany({ where: { deliveryId: offer.deliveryId, status: "OFFERED", NOT: { id: offer.id } }, data: { status: "CANCELLED" } });
  });
  const d = await db.delivery.findUniqueOrThrow({ where: { id: offer.deliveryId }, include: { order: true } });
  await notifyUsers([d.order.customerId], {
    type: "COURIER_ASSIGNED",
    title: `Entregador atribuído ao pedido #${d.order.code}`,
    body: "Um entregador vai recolher o seu pedido.",
    link: `/acompanhar/${d.order.code}`,
  });
  return d;
}

export async function declineOffer(userId: string, offerId: string) {
  const courier = await assertApprovedCourier(userId);
  const res = await db.deliveryOffer.updateMany({
    where: { id: offerId, courierId: courier.id, status: "OFFERED" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (res.count !== 1) throw new AppError("CONFLICT", "Esta oferta já não está disponível.");
}

/** Ações do entregador sobre a entrega atribuída (recolha, em trânsito, entrega). */
export async function courierAdvance(userId: string, deliveryId: string, to: OrderStatus, opts: { cashCollected?: boolean } = {}) {
  const courier = await assertApprovedCourier(userId);
  const d = await db.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.courierId !== courier.id) throw new AppError("NOT_FOUND", "Entrega não encontrada.");
  if (!["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(to)) throw new AppError("VALIDATION", "Ação inválida.");
  return transitionOrder({ role: "COURIER", userId }, d.orderId, to, { cashCollected: opts.cashCollected });
}

export async function reportDeliveryIssue(userId: string, deliveryId: string, type: string, description: string) {
  const courier = await assertApprovedCourier(userId);
  const d = await db.delivery.findUnique({ where: { id: deliveryId }, include: { order: { select: { code: true } } } });
  if (!d || d.courierId !== courier.id) throw new AppError("NOT_FOUND", "Entrega não encontrada.");
  if (!description.trim()) throw new AppError("VALIDATION", "Descreva o problema.");
  await db.deliveryIssue.create({ data: { deliveryId, courierId: courier.id, type: type.slice(0, 40), description: description.trim().slice(0, 1000) } });
  await notifyUsers(await adminUserIds(["OPERATIONS"]), {
    type: "DELIVERY_ISSUE",
    title: `Problema na entrega #${d.order.code}`,
    body: description.slice(0, 200),
    link: "/admin/entregas",
  });
}

/** Partilha de localização: apenas durante uma entrega ativa e com consentimento do entregador. */
export async function updateCourierLocation(userId: string, lat: number, lng: number) {
  const courier = await assertApprovedCourier(userId);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new AppError("VALIDATION", "Coordenadas inválidas.");
  const active = await db.delivery.count({ where: { courierId: courier.id, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } } });
  if (!active) throw new AppError("CONFLICT", "A localização só é partilhada durante uma entrega ativa.");
  await db.courier.update({ where: { id: courier.id }, data: { lastLatitude: lat, lastLongitude: lng, lastLocationAt: new Date() } });
}

/** Admin: atribuição manual ou libertação de uma entrega. */
export async function adminAssignCourier(adminId: string, deliveryId: string, courierId: string | null) {
  await assertAdmin(adminId, "deliveries.manage");
  const d = await db.delivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new AppError("NOT_FOUND", "Entrega não encontrada.");
  if (!["SEARCHING", "ASSIGNED"].includes(d.status)) throw new AppError("CONFLICT", "A entrega já foi recolhida ou terminou.");
  if (courierId) {
    const c = await db.courier.findUnique({ where: { id: courierId } });
    if (!c || c.status !== "APPROVED") throw new AppError("VALIDATION", "Entregador inválido ou não aprovado.");
    const res = await db.delivery.updateMany({
      where: { id: deliveryId, status: { in: ["SEARCHING", "ASSIGNED"] } },
      data: { courierId, status: "ASSIGNED", assignedAt: new Date() },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "A entrega foi alterada entretanto.");
    await db.deliveryOffer.updateMany({ where: { deliveryId, status: "OFFERED" }, data: { status: "CANCELLED" } });
    await notifyUsers([c.userId], { type: "DELIVERY_ASSIGNED", title: "Entrega atribuída", body: "Foi-lhe atribuída uma entrega pela equipa de operações.", link: "/entregador/entregas" });
  } else {
    await db.delivery.update({ where: { id: deliveryId }, data: { courierId: null, status: "SEARCHING", assignedAt: null } });
    await db.deliveryOffer.deleteMany({ where: { deliveryId } });
    await dispatchDelivery(deliveryId);
  }
  await audit({ actorId: adminId, action: courierId ? "delivery.assign" : "delivery.release", entityType: "Delivery", entityId: deliveryId, metadata: { courierId } });
}
