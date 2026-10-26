import type { Coupon, DeliveryMode } from "@prisma/client";
import { applyBps } from "@/lib/money";
import { isWithinWindow } from "@/lib/hours";
import { db, type Tx } from "../db";

export type CartLineInput = { productId: string; quantity: number; optionIds: string[]; notes?: string | null };

export type PricedLine = {
  index: number;
  productId: string;
  productName: string;
  basePriceCents: number;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  options: { group: string; name: string; priceDeltaCents: number }[];
  notes: string | null;
};

export type LineProblem = { index: number; productId: string; message: string };

/**
 * Calcula os preços das linhas a partir da base de dados (nunca a partir de valores do navegador)
 * e valida produtos, disponibilidade e opções obrigatórias.
 */
export async function priceLines(
  restaurantId: string,
  lines: CartLineInput[],
  timeZone: string,
  now = new Date(),
  tx: Tx = db,
): Promise<{ lines: PricedLine[]; problems: LineProblem[]; subtotalCents: number }> {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: ids } },
    include: { optionGroups: { include: { options: true }, orderBy: { position: "asc" } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const priced: PricedLine[] = [];
  const problems: LineProblem[] = [];

  for (const [index, line] of lines.entries()) {
    const p = byId.get(line.productId);
    if (!p || p.restaurantId !== restaurantId || p.status === "ARCHIVED") {
      problems.push({ index, productId: line.productId, message: "Este produto já não está disponível." });
      continue;
    }
    if (p.status !== "ACTIVE" || !isWithinWindow(p.availableFrom, p.availableUntil, now, timeZone)) {
      problems.push({ index, productId: p.id, message: `${p.name} está indisponível neste momento.` });
      continue;
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      problems.push({ index, productId: p.id, message: `Quantidade inválida para ${p.name}.` });
      continue;
    }
    const selected = new Set(line.optionIds);
    const chosen: PricedLine["options"] = [];
    let optionsOk = true;
    const knownOptionIds = new Set<string>();
    for (const g of p.optionGroups) {
      const picks = g.options.filter((o) => selected.has(o.id));
      g.options.forEach((o) => knownOptionIds.add(o.id));
      if (picks.some((o) => !o.isAvailable)) {
        problems.push({ index, productId: p.id, message: `Uma opção de "${g.name}" já não está disponível.` });
        optionsOk = false;
        break;
      }
      if (picks.length < g.minSelect || picks.length > g.maxSelect) {
        problems.push({
          index,
          productId: p.id,
          message:
            g.minSelect === g.maxSelect
              ? `Escolha ${g.minSelect} opção(ões) em "${g.name}".`
              : `Escolha entre ${g.minSelect} e ${g.maxSelect} opções em "${g.name}".`,
        });
        optionsOk = false;
        break;
      }
      picks.forEach((o) => chosen.push({ group: g.name, name: o.name, priceDeltaCents: o.priceDeltaCents }));
    }
    if (optionsOk && [...selected].some((id) => !knownOptionIds.has(id))) {
      problems.push({ index, productId: p.id, message: `Opções inválidas para ${p.name}.` });
      optionsOk = false;
    }
    if (!optionsOk) continue;
    const unit = p.priceCents + chosen.reduce((s, o) => s + o.priceDeltaCents, 0);
    priced.push({
      index,
      productId: p.id,
      productName: p.name,
      basePriceCents: p.priceCents,
      unitPriceCents: unit,
      quantity: line.quantity,
      totalCents: unit * line.quantity,
      options: chosen,
      notes: line.notes?.trim().slice(0, 300) || null,
    });
  }
  return { lines: priced, problems, subtotalCents: priced.reduce((s, l) => s + l.totalCents, 0) };
}

export function computeServiceFee(
  subtotalCents: number,
  s: { serviceFeeBps: number; serviceFeeFixedCents: number; serviceFeeMaxCents: number | null },
) {
  if (subtotalCents <= 0) return 0;
  let fee = applyBps(subtotalCents, s.serviceFeeBps) + s.serviceFeeFixedCents;
  if (s.serviceFeeMaxCents != null) fee = Math.min(fee, s.serviceFeeMaxCents);
  return Math.max(0, fee);
}

export type CouponCheck = { ok: true; discountCents: number } | { ok: false; message: string };

/** Valida todas as condições de um cupão. A contagem final de utilizações é revalidada atomicamente ao criar o pedido. */
export async function evaluateCoupon(
  coupon: (Coupon & { restaurants: { id: string }[] }) | null,
  ctx: { userId: string | null; restaurantId: string; cityId: string; subtotalCents: number; now?: Date },
  tx: Tx = db,
): Promise<CouponCheck> {
  const now = ctx.now ?? new Date();
  if (!coupon || !coupon.isActive) return { ok: false, message: "Cupão inválido." };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, message: "Este cupão ainda não está ativo." };
  if (coupon.endsAt && coupon.endsAt < now) return { ok: false, message: "Este cupão expirou." };
  if (coupon.restaurants.length && !coupon.restaurants.some((r) => r.id === ctx.restaurantId))
    return { ok: false, message: "Este cupão não é válido para este restaurante." };
  if (coupon.cityId && coupon.cityId !== ctx.cityId)
    return { ok: false, message: "Este cupão não é válido na sua cidade." };
  if (ctx.subtotalCents < coupon.minSubtotalCents)
    return { ok: false, message: "O valor mínimo para este cupão ainda não foi atingido." };
  if (coupon.usageLimitTotal != null && coupon.usedCount >= coupon.usageLimitTotal)
    return { ok: false, message: "Este cupão atingiu o limite de utilizações." };
  if (ctx.userId) {
    if (coupon.usageLimitPerUser != null) {
      const used = await tx.couponRedemption.count({
        where: { couponId: coupon.id, userId: ctx.userId, voided: false },
      });
      if (used >= coupon.usageLimitPerUser) return { ok: false, message: "Já utilizou este cupão." };
    }
    if (coupon.firstOrderOnly) {
      const prev = await tx.order.count({
        where: { customerId: ctx.userId, status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT"] } },
      });
      if (prev > 0) return { ok: false, message: "Este cupão é válido apenas na primeira encomenda." };
    }
  }
  let discount =
    coupon.type === "PERCENT" ? applyBps(ctx.subtotalCents, coupon.value) : Math.max(0, coupon.value);
  if (coupon.maxDiscountCents != null) discount = Math.min(discount, coupon.maxDiscountCents);
  discount = Math.min(discount, ctx.subtotalCents);
  return { ok: true, discountCents: discount };
}

export function computeFinancials(i: {
  subtotalCents: number;
  discountCents: number;
  discountFundedBy: "PLATFORM" | "RESTAURANT" | null;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  commissionBps: number;
  commissionFixedCents: number;
  deliveryMode: DeliveryMode;
  courierFeeShareBps: number;
  courierBaseFeeCents: number;
}) {
  const discount = Math.min(i.discountCents, i.subtotalCents);
  const restaurantDiscount = i.discountFundedBy === "RESTAURANT" ? discount : 0;
  const commissionBase = i.subtotalCents - restaurantDiscount;
  const commissionCents = Math.min(
    commissionBase,
    applyBps(commissionBase, i.commissionBps) + i.commissionFixedCents,
  );
  const restaurantNetCents =
    commissionBase - commissionCents + (i.deliveryMode === "RESTAURANT" ? i.deliveryFeeCents : 0);
  const courierFeeCents =
    i.deliveryMode === "PLATFORM"
      ? Math.max(i.courierBaseFeeCents, applyBps(i.deliveryFeeCents, i.courierFeeShareBps))
      : 0;
  const totalCents = i.subtotalCents - discount + i.deliveryFeeCents + i.serviceFeeCents;
  return { totalCents, commissionCents, restaurantNetCents, courierFeeCents, discountCents: discount };
}
