import { Prisma, type DeliveryMode, type OrderStatus, type PaymentProviderKey } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "../db";
import { AppError } from "../errors";
import { shortCode, randomToken } from "../auth/tokens";
import { normalizeMzPhone } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { audit } from "../audit";
import { assertAdmin, assertRestaurantAccess, loadActiveUser } from "../authz";
import { getSettingsUncached } from "./settings";
import { priceLines, evaluateCoupon, computeServiceFee, computeFinancials } from "./pricing";
import { resolveCommission } from "./commission";
import { restaurantAvailability } from "./availability";
import { findTransition, ORDER_STATUS_LABEL, type ActorRole } from "./order-state";
import { getProvider } from "../payments/registry";
import { notifyUsers, restaurantUserIds } from "./notifications";
import { dispatchDelivery } from "./deliveries";

export const checkoutSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  customerName: z.string().trim().min(2, "Indique o seu nome.").max(100),
  customerPhone: z.string().trim().min(9, "Indique um telefone válido.").max(20),
  addressId: z.string().optional().nullable(),
  address: z
    .object({
      cityId: z.string().min(1),
      neighborhoodId: z.string().min(1, "Escolha o bairro."),
      street: z.string().trim().min(3, "Indique a rua ou avenida.").max(200),
      reference: z.string().trim().max(300).optional().nullable(),
      latitude: z.number().min(-90).max(90).optional().nullable(),
      longitude: z.number().min(-180).max(180).optional().nullable(),
      saveAs: z.string().trim().max(40).optional().nullable(),
    })
    .optional()
    .nullable(),
  paymentMethod: z.enum(["MPESA", "EMOLA", "CARD", "CASH_ON_DELIVERY", "TEST"]),
  payerPhone: z.string().trim().max(20).optional().nullable(),
  notesForRestaurant: z.string().trim().max(500).optional().nullable(),
  notesForDelivery: z.string().trim().max(500).optional().nullable(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Métodos de pagamento ativos e efetivamente configurados no servidor. */
export async function availablePaymentMethods() {
  const configs = await db.paymentProviderConfig.findMany({ where: { enabled: true } });
  return configs
    .map((c) => ({ config: c, provider: getProvider(c.key) }))
    .filter((x) => x.provider && x.provider.missingConfig().length === 0)
    .map((x) => ({
      key: x.config.key,
      name: x.config.displayName,
      instructions: x.config.instructions,
      requiresPhone: x.provider!.requiresPhone,
      kind: x.provider!.kind,
    }));
}

async function uniqueOrderCode(tx: Tx) {
  for (let i = 0; i < 5; i++) {
    const code = shortCode("", 7);
    if (!(await tx.order.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  return shortCode("", 10);
}

/**
 * Cria um pedido a partir da sacola do cliente. Todos os preços, taxas, descontos e comissões
 * são calculados no servidor. Protegido contra duplicação por chave de idempotência.
 */
export async function placeOrder(userId: string, raw: CheckoutInput) {
  const input = checkoutSchema.parse(raw);
  const user = await loadActiveUser(userId);

  const existing = await db.order.findUnique({
    where: { customerId_idempotencyKey: { customerId: userId, idempotencyKey: input.idempotencyKey } },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (existing) return existing;

  const settings = await getSettingsUncached();
  const phone = normalizeMzPhone(input.customerPhone);
  if (!phone) throw new AppError("VALIDATION", "Número de telefone moçambicano inválido.");

  const cart = await db.cart.findUnique({ where: { userId }, include: { items: { orderBy: { createdAt: "asc" } } } });
  if (!cart || !cart.restaurantId || cart.items.length === 0) throw new AppError("VALIDATION", "A sua sacola está vazia.");

  const restaurant = await db.restaurant.findUnique({
    where: { id: cart.restaurantId },
    include: { hours: true, zones: { where: { isActive: true } } },
  });
  if (!restaurant) throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
  const availability = restaurantAvailability(restaurant, settings.timezone);
  if (!availability.orderable) throw new AppError("UNAVAILABLE", `O restaurante está ${availability.label.toLowerCase()} e não aceita pedidos agora.`);

  // Endereço
  let addr: { cityId: string; neighborhoodId: string; street: string; reference: string | null; latitude: number | null; longitude: number | null };
  if (input.addressId) {
    const a = await db.address.findUnique({ where: { id: input.addressId } });
    if (!a || a.userId !== userId) throw new AppError("NOT_FOUND", "Endereço não encontrado.");
    addr = a;
  } else if (input.address) {
    addr = {
      cityId: input.address.cityId,
      neighborhoodId: input.address.neighborhoodId,
      street: input.address.street,
      reference: input.address.reference ?? null,
      latitude: input.address.latitude ?? null,
      longitude: input.address.longitude ?? null,
    };
  } else throw new AppError("VALIDATION", "Indique o endereço de entrega.");

  const nb = await db.neighborhood.findUnique({ where: { id: addr.neighborhoodId }, include: { city: true } });
  if (!nb || nb.cityId !== addr.cityId || !nb.isActive || !nb.city.isActive) throw new AppError("VALIDATION", "Bairro inválido.");
  const zone = restaurant.zones.find((z) => z.neighborhoodId === nb.id);
  if (!zone) throw new AppError("UNAVAILABLE", `Este restaurante não entrega em ${nb.name}.`);

  // Modelo de entrega permitido
  const deliveryMode: DeliveryMode = restaurant.deliveryMode;
  if ((deliveryMode === "PLATFORM" && !restaurant.allowPlatformDelivery) || (deliveryMode === "RESTAURANT" && !restaurant.allowRestaurantDelivery)) {
    throw new AppError("UNAVAILABLE", "O modelo de entrega deste restaurante não está ativo. Contacte o suporte.");
  }

  // Pagamento
  const methods = await availablePaymentMethods();
  const method = methods.find((m) => m.key === input.paymentMethod);
  if (!method) throw new AppError("VALIDATION", "Método de pagamento indisponível.");
  if (method.key === "CASH_ON_DELIVERY" && !restaurant.acceptsCashOnDelivery)
    throw new AppError("VALIDATION", "Este restaurante não aceita pagamento na entrega.");
  let payerPhone: string | null = null;
  if (method.requiresPhone) {
    payerPhone = normalizeMzPhone(input.payerPhone || input.customerPhone);
    if (!payerPhone) throw new AppError("VALIDATION", "Indique o número para o pagamento móvel.");
  }

  const now = new Date();
  const commission = await resolveCommission(restaurant.id, now);
  let duplicate = false;

  const order = await db
    .$transaction(
      async (tx) => {
        const priced = await priceLines(
          restaurant.id,
          cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, optionIds: i.optionIds, notes: i.notes })),
          settings.timezone,
          now,
          tx,
        );
        if (priced.problems.length) throw new AppError("VALIDATION", priced.problems[0].message, { problems: priced.problems });
        if (priced.lines.length === 0) throw new AppError("VALIDATION", "A sua sacola está vazia.");
        if (priced.subtotalCents < restaurant.minOrderCents)
          throw new AppError("VALIDATION", `O pedido mínimo deste restaurante é ${formatMoney(restaurant.minOrderCents, settings.currency)}.`);

        // Cupão: bloqueia a linha do cupão para validar limites sem condições de corrida.
        let discountCents = 0;
        let discountFundedBy: "PLATFORM" | "RESTAURANT" | null = null;
        let couponId: string | null = null;
        if (cart.couponCode) {
          const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Coupon" WHERE code = ${cart.couponCode} FOR UPDATE`;
          const coupon = locked[0]
            ? await tx.coupon.findUnique({ where: { id: locked[0].id }, include: { restaurants: { select: { id: true } } } })
            : null;
          const check = await evaluateCoupon(
            coupon,
            { userId, restaurantId: restaurant.id, cityId: nb.cityId, subtotalCents: priced.subtotalCents, now },
            tx,
          );
          if (!check.ok) throw new AppError("VALIDATION", `Cupão: ${check.message}`);
          discountCents = check.discountCents;
          discountFundedBy = coupon!.fundedBy === "RESTAURANT" ? "RESTAURANT" : "PLATFORM";
          couponId = coupon!.id;
          await tx.coupon.update({ where: { id: coupon!.id }, data: { usedCount: { increment: 1 } } });
        }

        const serviceFeeCents = computeServiceFee(priced.subtotalCents, settings);
        const fin = computeFinancials({
          subtotalCents: priced.subtotalCents,
          discountCents,
          discountFundedBy,
          deliveryFeeCents: zone.feeCents,
          serviceFeeCents,
          commissionBps: commission.bps,
          commissionFixedCents: commission.fixedCents,
          deliveryMode,
          courierFeeShareBps: settings.courierFeeShareBps,
          courierBaseFeeCents: settings.courierBaseFeeCents,
        });

        const isOffline = method.kind === "OFFLINE";
        const code = await uniqueOrderCode(tx);
        const created = await tx.order.create({
          data: {
            code,
            customerId: userId,
            restaurantId: restaurant.id,
            status: isOffline ? "PLACED" : "PENDING_PAYMENT",
            paymentStatus: "PENDING",
            paymentMethod: method.key,
            deliveryMode,
            currency: settings.currency,
            customerName: input.customerName,
            customerPhone: phone,
            cityId: nb.cityId,
            cityName: nb.city.name,
            neighborhoodId: nb.id,
            neighborhoodName: nb.name,
            street: addr.street,
            addressReference: addr.reference,
            latitude: addr.latitude,
            longitude: addr.longitude,
            notesForRestaurant: input.notesForRestaurant || null,
            notesForDelivery: input.notesForDelivery || null,
            subtotalCents: priced.subtotalCents,
            discountCents: fin.discountCents,
            discountFundedBy,
            deliveryFeeCents: zone.feeCents,
            serviceFeeCents,
            totalCents: fin.totalCents,
            commissionBps: commission.bps,
            commissionFixedCents: commission.fixedCents,
            commissionCents: fin.commissionCents,
            restaurantNetCents: fin.restaurantNetCents,
            courierFeeCents: fin.courierFeeCents,
            couponId,
            idempotencyKey: input.idempotencyKey,
            placedAt: isOffline ? now : null,
            items: {
              create: priced.lines.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                basePriceCents: l.basePriceCents,
                unitPriceCents: l.unitPriceCents,
                quantity: l.quantity,
                totalCents: l.totalCents,
                options: l.options,
                notes: l.notes,
              })),
            },
            events: {
              create: [
                { toStatus: "PENDING_PAYMENT", actorId: userId, actorRole: "CUSTOMER", note: "Pedido criado" },
                ...(isOffline
                  ? [{ fromStatus: "PENDING_PAYMENT" as OrderStatus, toStatus: "PLACED" as OrderStatus, actorRole: "SYSTEM", note: "Pagamento na entrega" }]
                  : []),
              ],
            },
            payments: {
              create: {
                provider: method.key,
                status: "PENDING",
                amountCents: fin.totalCents,
                currency: settings.currency,
                reference: `P${randomToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`,
                payerPhone,
                events: { create: { type: "CREATED" } },
              },
            },
          },
          include: { payments: true },
        });
        if (couponId) {
          await tx.couponRedemption.create({ data: { couponId, orderId: created.id, userId, discountCents: fin.discountCents } });
        }
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { restaurantId: null, couponCode: null } });

        if (input.address?.saveAs) {
          const hasDefault = await tx.address.count({ where: { userId, isDefault: true } });
          await tx.address.create({
            data: {
              userId,
              label: input.address.saveAs,
              cityId: nb.cityId,
              neighborhoodId: nb.id,
              street: addr.street,
              reference: addr.reference,
              latitude: addr.latitude,
              longitude: addr.longitude,
              isDefault: hasDefault === 0,
            },
          });
        }
        return created;
      },
      { timeout: 15_000 },
    )
    .catch(async (e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const dup = await db.order.findUnique({
          where: { customerId_idempotencyKey: { customerId: userId, idempotencyKey: input.idempotencyKey } },
          include: { payments: true },
        });
        if (dup) {
          duplicate = true;
          return dup;
        }
      }
      throw e;
    });

  if (!duplicate && order.status === "PLACED") await onOrderPlaced(order.id);
  void user;
  return order;
}

/** Efeitos de um pedido passar a "recebido" (pago ou pagamento na entrega). */
export async function onOrderPlaced(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, code: true, restaurantId: true, customerId: true, totalCents: true, currency: true } });
  if (!order) return;
  await notifyUsers(await restaurantUserIds(order.restaurantId), {
    type: "ORDER_NEW",
    title: `Novo pedido #${order.code}`,
    body: `Recebeu um novo pedido de ${formatMoney(order.totalCents, order.currency)}.`,
    link: `/parceiro/pedidos?pedido=${order.id}`,
    email: "order",
  });
  await notifyUsers([order.customerId], {
    type: "ORDER_PLACED",
    title: `Pedido #${order.code} recebido`,
    body: "O restaurante foi notificado. Acompanhe o estado do seu pedido.",
    link: `/acompanhar/${order.code}`,
    email: "order",
  });
}

export type TransitionActor = { role: ActorRole; userId: string | null };

export type TransitionOptions = {
  reason?: string | null;
  prepTimeMinutes?: number | null;
  cashCollected?: boolean;
};

/**
 * Altera o estado de um pedido validando a transição, a autorização do ator e a concorrência
 * (atualização condicional sobre o estado anterior).
 */
export async function transitionOrder(actor: TransitionActor, orderId: string, to: OrderStatus, opts: TransitionOptions = {}) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { delivery: { include: { courier: true } }, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order) throw new AppError("NOT_FOUND", "Pedido não encontrado.");

  // Autorização
  if (actor.role === "CUSTOMER") {
    if (!actor.userId || order.customerId !== actor.userId) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
    await loadActiveUser(actor.userId);
  } else if (actor.role === "RESTAURANT") {
    if (!actor.userId) throw new AppError("FORBIDDEN", "Sem permissão.");
    await assertRestaurantAccess(actor.userId, order.restaurantId, "orders.manage");
  } else if (actor.role === "COURIER") {
    if (!actor.userId || !order.delivery?.courier || order.delivery.courier.userId !== actor.userId)
      throw new AppError("FORBIDDEN", "Esta entrega não está atribuída a si.");
    if (order.delivery.courier.status !== "APPROVED") throw new AppError("FORBIDDEN", "Conta de entregador não aprovada.");
  } else if (actor.role === "ADMIN") {
    if (!actor.userId) throw new AppError("FORBIDDEN", "Sem permissão.");
    await assertAdmin(actor.userId, "orders.intervene");
  }

  const rule = findTransition(order.status, to, actor.role, order.deliveryMode);
  if (!rule) {
    throw new AppError(
      "CONFLICT",
      `Não é possível passar de "${ORDER_STATUS_LABEL[order.status]}" para "${ORDER_STATUS_LABEL[to]}".`,
    );
  }
  const reason = opts.reason?.trim().slice(0, 500) || null;
  if (rule.requiresReason && !reason && actor.role !== "SYSTEM") throw new AppError("VALIDATION", "Indique o motivo.");

  const settings = await getSettingsUncached();
  if (actor.role === "CUSTOMER" && to === "CANCELLED" && order.status === "PLACED" && settings.customerCancelWindow === "NEVER") {
    throw new AppError("FORBIDDEN", "O cancelamento pelo cliente não está disponível. Contacte o suporte.");
  }
  if (to === "PICKED_UP" && order.deliveryMode === "PLATFORM" && !order.delivery?.courierId) {
    throw new AppError("CONFLICT", "Ainda não há entregador atribuído a este pedido.");
  }

  const payment = order.payments[0] ?? null;
  const isCash = order.paymentMethod === "CASH_ON_DELIVERY";
  if (to === "DELIVERED" && isCash && !opts.cashCollected) {
    throw new AppError("VALIDATION", "Confirme que recebeu o pagamento em numerário.");
  }

  const now = new Date();
  const data: Prisma.OrderUpdateManyMutationInput = { status: to };
  if (to === "ACCEPTED") {
    const prep = Math.min(240, Math.max(5, Math.round(opts.prepTimeMinutes ?? 30)));
    data.acceptedAt = now;
    data.prepTimeMinutes = prep;
    data.estimatedReadyAt = new Date(now.getTime() + prep * 60_000);
  }
  if (to === "READY_FOR_PICKUP") data.readyAt = now;
  if (to === "PICKED_UP") data.pickedUpAt = now;
  if (to === "DELIVERED") {
    data.deliveredAt = now;
    if (isCash) {
      data.paymentStatus = "PAID";
      data.cashCollectedAt = now;
      data.cashCollectedById = actor.userId;
    }
  }
  if (to === "REJECTED") {
    data.rejectReason = reason;
    data.cancelledAt = now;
  }
  if (to === "CANCELLED") {
    data.cancelReason = reason ?? "Cancelado";
    data.cancelledByRole = actor.role;
    data.cancelledAt = now;
  }
  const endsUnpaid = (to === "CANCELLED" || to === "REJECTED") && order.paymentStatus !== "PAID";
  const needsRefund = (to === "CANCELLED" || to === "REJECTED") && order.paymentStatus === "PAID" && !isCash;
  if (endsUnpaid) data.paymentStatus = "CANCELLED";
  if (needsRefund) data.paymentStatus = "REFUND_PENDING";

  let createdDeliveryId: string | null = null;
  await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data });
    if (res.count !== 1) throw new AppError("CONFLICT", "O pedido foi alterado entretanto. Atualize a página.");
    await tx.orderStatusEvent.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: to, actorId: actor.userId, actorRole: actor.role, note: reason },
    });

    if (payment) {
      if (to === "DELIVERED" && isCash) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: now } });
        await tx.paymentEvent.create({ data: { paymentId: payment.id, type: "CASH_COLLECTED", data: { by: actor.userId, role: actor.role } } });
      }
      if (endsUnpaid && ["PENDING", "PROCESSING"].includes(payment.status)) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
      }
      if (needsRefund) {
        await tx.refund.create({
          data: {
            orderId: order.id,
            paymentId: payment.id,
            amountCents: payment.amountCents,
            reason: reason ?? "Pedido cancelado",
            requestedById: actor.userId,
          },
        });
      }
    }

    if (to === "CANCELLED" || to === "REJECTED") {
      await tx.couponRedemption.updateMany({ where: { orderId: order.id, voided: false }, data: { voided: true } });
      if (order.couponId) {
        await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${order.couponId}`;
      }
      if (order.delivery && order.delivery.status !== "DELIVERED") {
        await tx.delivery.update({ where: { id: order.delivery.id }, data: { status: "CANCELLED", cancelledAt: now } });
        await tx.deliveryOffer.updateMany({ where: { deliveryId: order.delivery.id, status: "OFFERED" }, data: { status: "CANCELLED" } });
      }
    }
    if (to === "ACCEPTED" && order.deliveryMode === "PLATFORM" && !order.delivery) {
      const d = await tx.delivery.create({
        data: { orderId: order.id, cityId: order.cityId, courierFeeCents: order.courierFeeCents },
      });
      createdDeliveryId = d.id;
    }
    if (order.delivery && order.deliveryMode === "PLATFORM") {
      if (to === "PICKED_UP") await tx.delivery.update({ where: { id: order.delivery.id }, data: { status: "PICKED_UP", pickedUpAt: now } });
      if (to === "IN_TRANSIT") await tx.delivery.update({ where: { id: order.delivery.id }, data: { status: "IN_TRANSIT" } });
      if (to === "DELIVERED") await tx.delivery.update({ where: { id: order.delivery.id }, data: { status: "DELIVERED", deliveredAt: now } });
    }
    if (actor.role === "ADMIN") {
      await audit(
        { actorId: actor.userId, action: "order.status_change", entityType: "Order", entityId: order.id, metadata: { from: order.status, to, reason } },
        tx,
      );
    }
  });

  if (createdDeliveryId) await dispatchDelivery(createdDeliveryId).catch(() => undefined);
  await notifyTransition(order.id, to, reason);
  return db.order.findUniqueOrThrow({ where: { id: order.id } });
}

async function notifyTransition(orderId: string, to: OrderStatus, reason: string | null) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { restaurant: { select: { name: true } }, delivery: { include: { courier: true } } } });
  if (!o) return;
  const link = `/acompanhar/${o.code}`;
  const messages: Partial<Record<OrderStatus, { title: string; body: string; email?: boolean }>> = {
    ACCEPTED: { title: `Pedido #${o.code} aceite`, body: `${o.restaurant.name} aceitou o seu pedido. Tempo estimado de preparação: ${o.prepTimeMinutes ?? "-"} min.`, email: true },
    PREPARING: { title: `Pedido #${o.code} em preparação`, body: `${o.restaurant.name} está a preparar o seu pedido.` },
    READY_FOR_PICKUP: { title: `Pedido #${o.code} pronto`, body: "O seu pedido está pronto e aguarda recolha." },
    PICKED_UP: { title: `Pedido #${o.code} recolhido`, body: "O seu pedido foi recolhido para entrega." },
    IN_TRANSIT: { title: `Pedido #${o.code} a caminho`, body: "O seu pedido está a caminho." },
    DELIVERED: { title: `Pedido #${o.code} entregue`, body: "Bom apetite! Pode avaliar o restaurante na sua conta.", email: true },
    REJECTED: { title: `Pedido #${o.code} recusado`, body: `O restaurante não pôde aceitar o pedido.${reason ? ` Motivo: ${reason}` : ""}${o.paymentStatus === "REFUND_PENDING" ? " O reembolso será processado." : ""}`, email: true },
    CANCELLED: { title: `Pedido #${o.code} cancelado`, body: `${reason ? `Motivo: ${reason}. ` : ""}${o.paymentStatus === "REFUND_PENDING" ? "O reembolso será processado." : ""}`, email: true },
  };
  const m = messages[to];
  if (m) await notifyUsers([o.customerId], { type: `ORDER_${to}`, title: m.title, body: m.body, link, email: m.email ? "order" : false });
  if (to === "CANCELLED") {
    await notifyUsers(await restaurantUserIds(o.restaurantId), {
      type: "ORDER_CANCELLED",
      title: `Pedido #${o.code} cancelado`,
      body: reason ?? "O pedido foi cancelado.",
      link: `/parceiro/pedidos?pedido=${o.id}`,
    });
    if (o.delivery?.courier) {
      await notifyUsers([o.delivery.courier.userId], { type: "DELIVERY_CANCELLED", title: `Entrega #${o.code} cancelada`, body: reason ?? "", link: "/entregador/entregas" });
    }
  }
}

/** Pedidos visíveis apenas ao próprio cliente. */
export async function getCustomerOrder(userId: string, code: string) {
  const order = await db.order.findUnique({
    where: { code },
    include: {
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      restaurant: { select: { name: true, slug: true, phone: true, logoFileId: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      delivery: { include: { courier: { include: { user: { select: { name: true, phone: true } } } } } },
      review: true,
    },
  });
  if (!order || order.customerId !== userId) return null;
  return order;
}

export async function listPaymentMethodKeys(): Promise<PaymentProviderKey[]> {
  return (await availablePaymentMethods()).map((m) => m.key);
}
