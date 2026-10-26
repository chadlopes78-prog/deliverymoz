import { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin } from "../authz";
import { getSettingsUncached } from "./settings";
import { notifyUsers, restaurantUserIds } from "./notifications";

/** Pedidos que contam como venda: não cancelados, não recusados e com pagamento confirmado ou na entrega. */
const SALE_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"] as const;

export type Range = { from: Date; to: Date };

export function parseRange(sp: { de?: string; ate?: string; periodo?: string }): Range & { key: string } {
  const now = new Date();
  const end = sp.ate ? new Date(`${sp.ate}T23:59:59.999`) : now;
  if (sp.de) return { from: new Date(`${sp.de}T00:00:00`), to: end, key: "custom" };
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[sp.periodo ?? "30d"] ?? 30;
  return { from: new Date(now.getTime() - days * 86400_000), to: end, key: sp.periodo ?? "30d" };
}

/** Indicadores globais calculados a partir dos dados reais. */
export async function platformOverview(range: Range) {
  const settings = await getSettingsUncached();
  const startOfToday = new Date(new Date().toLocaleString("en-US", { timeZone: settings.timezone }));
  startOfToday.setHours(0, 0, 0, 0);
  const inRange = { createdAt: { gte: range.from, lte: range.to } };
  const [
    totalOrders, ordersToday, inProgress, delivered, cancelled, customers, restaurants, activeRestaurants, pendingRestaurants,
    approvedCouriers, availableCouriers, sales, deliveredFin, pendingRefunds, unsettled,
  ] = await Promise.all([
    db.order.count({ where: { ...inRange, status: { not: "PENDING_PAYMENT" } } }),
    db.order.count({ where: { createdAt: { gte: startOfToday }, status: { not: "PENDING_PAYMENT" } } }),
    db.order.count({ where: { status: { in: ["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT"] } } }),
    db.order.count({ where: { ...inRange, status: "DELIVERED" } }),
    db.order.count({ where: { ...inRange, status: { in: ["CANCELLED", "REJECTED"] }, placedAt: { not: null } } }),
    db.user.count({ where: { status: { not: "CLOSED" }, isSuperAdmin: false, staff: null } }),
    db.restaurant.count(),
    db.restaurant.count({ where: { status: "APPROVED" } }),
    db.restaurant.count({ where: { status: "PENDING" } }),
    db.courier.count({ where: { status: "APPROVED" } }),
    db.courier.count({ where: { status: "APPROVED", isAvailable: true } }),
    db.order.aggregate({ where: { ...inRange, status: { in: [...SALE_STATUSES] } }, _sum: { totalCents: true }, _count: true }),
    db.order.aggregate({
      where: { ...inRange, status: "DELIVERED", paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      _sum: { commissionCents: true, serviceFeeCents: true, deliveryFeeCents: true, courierFeeCents: true, discountCents: true, restaurantNetCents: true },
    }),
    db.refund.aggregate({ where: { status: { in: ["PENDING", "PROCESSING"] } }, _sum: { amountCents: true }, _count: true }),
    db.order.aggregate({
      where: { status: "DELIVERED", paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] }, settlementId: null },
      _sum: { restaurantNetCents: true },
    }),
  ]);
  const gross = sales._sum.totalCents ?? 0;
  return {
    currency: settings.currency,
    totalOrders,
    ordersToday,
    inProgress,
    delivered,
    cancelled,
    cancelRate: totalOrders ? cancelled / totalOrders : 0,
    customers,
    restaurants,
    activeRestaurants,
    pendingRestaurants,
    approvedCouriers,
    availableCouriers,
    grossCents: gross,
    salesCount: sales._count,
    avgTicketCents: sales._count ? Math.round(gross / sales._count) : 0,
    commissionCents: deliveredFin._sum.commissionCents ?? 0,
    serviceFeeCents: deliveredFin._sum.serviceFeeCents ?? 0,
    pendingRefundsCents: pendingRefunds._sum.amountCents ?? 0,
    pendingRefundsCount: pendingRefunds._count,
    unsettledRestaurantNetCents: unsettled._sum.restaurantNetCents ?? 0,
  };
}

export async function dailySeries(range: Range, restaurantId?: string) {
  const settings = await getSettingsUncached();
  const tz = settings.timezone;
  const rows = await db.$queryRaw<{ day: Date; orders: bigint; gross: bigint | null; commission: bigint | null; cancelled: bigint }[]>`
    SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}) AS day,
           COUNT(*) FILTER (WHERE status::text NOT IN ('CANCELLED','REJECTED','PENDING_PAYMENT')) AS orders,
           SUM("totalCents") FILTER (WHERE status::text NOT IN ('CANCELLED','REJECTED','PENDING_PAYMENT')) AS gross,
           SUM("commissionCents") FILTER (WHERE status::text = 'DELIVERED') AS commission,
           COUNT(*) FILTER (WHERE status::text IN ('CANCELLED','REJECTED') AND "placedAt" IS NOT NULL) AS cancelled
    FROM "Order"
    WHERE "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
      ${restaurantId ? Prisma.sql`AND "restaurantId" = ${restaurantId}` : Prisma.empty}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    orders: Number(r.orders),
    grossCents: Number(r.gross ?? 0),
    commissionCents: Number(r.commission ?? 0),
    cancelled: Number(r.cancelled),
  }));
}

export async function topRestaurants(range: Range, take = 8) {
  const rows = await db.order.groupBy({
    by: ["restaurantId"],
    where: { createdAt: { gte: range.from, lte: range.to }, status: { in: [...SALE_STATUSES] } },
    _count: true,
    _sum: { totalCents: true },
    orderBy: { _count: { restaurantId: "desc" } },
    take,
  });
  const names = await db.restaurant.findMany({ where: { id: { in: rows.map((r) => r.restaurantId) } }, select: { id: true, name: true } });
  return rows.map((r) => ({ id: r.restaurantId, name: names.find((n) => n.id === r.restaurantId)?.name ?? "—", orders: r._count, grossCents: r._sum.totalCents ?? 0 }));
}

export async function paymentMethodBreakdown(range: Range, restaurantId?: string) {
  const rows = await db.order.groupBy({
    by: ["paymentMethod"],
    where: { createdAt: { gte: range.from, lte: range.to }, status: { in: [...SALE_STATUSES] }, ...(restaurantId ? { restaurantId } : {}) },
    _count: true,
    _sum: { totalCents: true },
  });
  return rows.map((r) => ({ method: r.paymentMethod, orders: r._count, grossCents: r._sum.totalCents ?? 0 }));
}

/**
 * Saldo de um restaurante (não liquidado). Para cada pedido entregue com pagamento confirmado:
 *  - se a plataforma recebeu o dinheiro (pagamento online ou numerário recolhido por entregador da plataforma):
 *      a plataforma deve ao restaurante o valor líquido (menos reembolsos parciais concluídos);
 *  - se o restaurante recebeu o numerário (entrega própria): o restaurante deve à plataforma (total − líquido).
 */
export async function restaurantBalance(restaurantId: string, upTo?: Date) {
  const orders = await db.order.findMany({
    where: {
      restaurantId,
      status: "DELIVERED",
      paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] },
      settlementId: null,
      ...(upTo ? { deliveredAt: { lte: upTo } } : {}),
    },
    select: { id: true, totalCents: true, restaurantNetCents: true, paymentMethod: true, deliveryMode: true, refunds: { where: { status: "COMPLETED" }, select: { amountCents: true } } },
  });
  let owedToRestaurant = 0;
  let owedToPlatform = 0;
  for (const o of orders) {
    const refunded = o.refunds.reduce((s, r) => s + r.amountCents, 0);
    const restaurantCollected = o.paymentMethod === "CASH_ON_DELIVERY" && o.deliveryMode === "RESTAURANT";
    if (restaurantCollected) owedToPlatform += o.totalCents - o.restaurantNetCents;
    else owedToRestaurant += Math.max(0, o.restaurantNetCents - refunded);
  }
  return { orderIds: orders.map((o) => o.id), orderCount: orders.length, owedToRestaurant, owedToPlatform, netCents: owedToRestaurant - owedToPlatform };
}

export async function createSettlement(adminId: string, restaurantId: string, periodEnd: Date, notes?: string | null) {
  await assertAdmin(adminId, "finance.manage");
  const settings = await getSettingsUncached();
  const settlement = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settle:${restaurantId}`}))`;
    const bal = await restaurantBalance(restaurantId, periodEnd);
    if (!bal.orderCount) throw new AppError("VALIDATION", "Não há pedidos por liquidar até essa data.");
    const s = await tx.settlement.create({
      data: { restaurantId, periodEnd, amountCents: bal.netCents, currency: settings.currency, orderCount: bal.orderCount, notes: notes || null, createdById: adminId },
    });
    const res = await tx.order.updateMany({ where: { id: { in: bal.orderIds }, settlementId: null }, data: { settlementId: s.id } });
    if (res.count !== bal.orderCount) throw new AppError("CONFLICT", "Os pedidos foram alterados entretanto. Tente novamente.");
    return s;
  });
  await audit({ actorId: adminId, action: "settlement.create", entityType: "Settlement", entityId: settlement.id, metadata: { amountCents: settlement.amountCents } });
  return settlement;
}

export async function markSettlementPaid(adminId: string, settlementId: string, reference: string) {
  await assertAdmin(adminId, "finance.manage");
  if (!reference.trim()) throw new AppError("VALIDATION", "Indique a referência da transferência.");
  const res = await db.settlement.updateMany({ where: { id: settlementId, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(), reference: reference.trim() } });
  if (res.count !== 1) throw new AppError("CONFLICT", "Liquidação já tratada.");
  const s = await db.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  await audit({ actorId: adminId, action: "settlement.paid", entityType: "Settlement", entityId: settlementId, metadata: { reference } });
  await notifyUsers(await restaurantUserIds(s.restaurantId, ["OWNER"]), {
    type: "SETTLEMENT_PAID",
    title: "Liquidação registada",
    body: `Foi registada uma liquidação com a referência ${reference.trim()}.`,
    link: "/parceiro/financeiro",
  });
}

export async function cancelSettlement(adminId: string, settlementId: string) {
  await assertAdmin(adminId, "finance.manage");
  await db.$transaction(async (tx) => {
    const res = await tx.settlement.updateMany({ where: { id: settlementId, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (res.count !== 1) throw new AppError("CONFLICT", "Só é possível anular liquidações pendentes.");
    await tx.order.updateMany({ where: { settlementId }, data: { settlementId: null } });
  });
  await audit({ actorId: adminId, action: "settlement.cancel", entityType: "Settlement", entityId: settlementId });
}

// ─────────────────────────── Entregadores ───────────────────────────

export async function courierEarnings(courierId: string) {
  const [delivered, unpaid, paid, cancelled] = await Promise.all([
    db.delivery.aggregate({ where: { courierId, status: "DELIVERED" }, _sum: { courierFeeCents: true }, _count: true }),
    db.delivery.aggregate({ where: { courierId, status: "DELIVERED", courierPayoutId: null }, _sum: { courierFeeCents: true }, _count: true }),
    db.courierPayout.aggregate({ where: { courierId, status: "PAID" }, _sum: { amountCents: true } }),
    db.delivery.count({ where: { courierId, status: "CANCELLED" } }),
  ]);
  const cash = await db.order.aggregate({
    where: { delivery: { courierId }, paymentMethod: "CASH_ON_DELIVERY", status: "DELIVERED", deliveryMode: "PLATFORM" },
    _sum: { totalCents: true },
  });
  return {
    deliveredCount: delivered._count,
    cancelledCount: cancelled,
    earnedCents: delivered._sum.courierFeeCents ?? 0,
    unpaidCents: unpaid._sum.courierFeeCents ?? 0,
    unpaidCount: unpaid._count,
    paidCents: paid._sum.amountCents ?? 0,
    cashCollectedCents: cash._sum.totalCents ?? 0,
  };
}

export async function createCourierPayout(adminId: string, courierId: string, reference: string) {
  await assertAdmin(adminId, "finance.manage");
  if (!reference.trim()) throw new AppError("VALIDATION", "Indique a referência do pagamento.");
  const settings = await getSettingsUncached();
  const payout = await db.$transaction(async (tx) => {
    const deliveries = await tx.delivery.findMany({ where: { courierId, status: "DELIVERED", courierPayoutId: null }, select: { id: true, courierFeeCents: true } });
    if (!deliveries.length) throw new AppError("VALIDATION", "Não há entregas por pagar.");
    const amount = deliveries.reduce((s, d) => s + d.courierFeeCents, 0);
    const p = await tx.courierPayout.create({
      data: { courierId, amountCents: amount, currency: settings.currency, status: "PAID", reference: reference.trim(), paidAt: new Date(), createdById: adminId },
    });
    const res = await tx.delivery.updateMany({ where: { id: { in: deliveries.map((d) => d.id) }, courierPayoutId: null }, data: { courierPayoutId: p.id } });
    if (res.count !== deliveries.length) throw new AppError("CONFLICT", "As entregas foram alteradas entretanto.");
    return p;
  });
  await audit({ actorId: adminId, action: "courier.payout", entityType: "CourierPayout", entityId: payout.id, metadata: { amountCents: payout.amountCents } });
  return payout;
}

// ─────────────────────────── Exportação ───────────────────────────

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Neutraliza fórmulas (injeção CSV) e escapa aspas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function ordersCsv(range: Range, restaurantId?: string) {
  const orders = await db.order.findMany({
    where: { createdAt: { gte: range.from, lte: range.to }, ...(restaurantId ? { restaurantId } : {}) },
    include: { restaurant: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const header = ["codigo", "data", "restaurante", "estado", "pagamento", "estado_pagamento", "entrega", "subtotal", "desconto", "taxa_entrega", "taxa_servico", "total", "comissao", "liquido_restaurante", "moeda"];
  const lines = orders.map((o) =>
    [o.code, o.createdAt.toISOString(), o.restaurant.name, o.status, o.paymentMethod, o.paymentStatus, o.deliveryMode,
      (o.subtotalCents / 100).toFixed(2), (o.discountCents / 100).toFixed(2), (o.deliveryFeeCents / 100).toFixed(2), (o.serviceFeeCents / 100).toFixed(2),
      (o.totalCents / 100).toFixed(2), (o.commissionCents / 100).toFixed(2), (o.restaurantNetCents / 100).toFixed(2), o.currency].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export async function restaurantOverview(restaurantId: string, range: Range) {
  const settings = await getSettingsUncached();
  const startOfToday = new Date(new Date().toLocaleString("en-US", { timeZone: settings.timezone }));
  startOfToday.setHours(0, 0, 0, 0);
  const inRange = { restaurantId, createdAt: { gte: range.from, lte: range.to } };
  const [today, pending, preparing, completed, sales, top, restaurant, balance, settled] = await Promise.all([
    db.order.count({ where: { restaurantId, createdAt: { gte: startOfToday }, status: { not: "PENDING_PAYMENT" } } }),
    db.order.count({ where: { restaurantId, status: "PLACED" } }),
    db.order.count({ where: { restaurantId, status: { in: ["ACCEPTED", "PREPARING"] } } }),
    db.order.count({ where: { ...inRange, status: "DELIVERED" } }),
    db.order.aggregate({
      where: { ...inRange, status: { in: [...SALE_STATUSES] } },
      _sum: { subtotalCents: true, totalCents: true, commissionCents: true, discountCents: true, restaurantNetCents: true },
      _count: true,
    }),
    db.orderItem.groupBy({
      by: ["productName"],
      where: { order: { ...inRange, status: { in: [...SALE_STATUSES] } } },
      _sum: { quantity: true, totalCents: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { ratingAvg: true, ratingCount: true } }),
    restaurantBalance(restaurantId),
    db.settlement.aggregate({ where: { restaurantId, status: "PAID" }, _sum: { amountCents: true } }),
  ]);
  return {
    currency: settings.currency,
    today,
    pending,
    preparing,
    completed,
    salesCount: sales._count,
    grossCents: sales._sum.subtotalCents ?? 0,
    avgTicketCents: sales._count ? Math.round((sales._sum.subtotalCents ?? 0) / sales._count) : 0,
    commissionCents: sales._sum.commissionCents ?? 0,
    discountCents: sales._sum.discountCents ?? 0,
    estimatedNetCents: sales._sum.restaurantNetCents ?? 0,
    topProducts: top.map((t) => ({ name: t.productName, quantity: t._sum.quantity ?? 0, totalCents: t._sum.totalCents ?? 0 })),
    rating: restaurant,
    balance,
    settledPaidCents: settled._sum.amountCents ?? 0,
  };
}
