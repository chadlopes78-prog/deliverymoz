import { db } from "../db";
import { AppError } from "../errors";
import { priceLines, evaluateCoupon, computeServiceFee } from "./pricing";
import { getSettingsUncached } from "./settings";
import { restaurantAvailability } from "./availability";

export type CartRef = { userId?: string | null; tokenHash?: string | null };

function whereRef(ref: CartRef) {
  if (ref.userId) return { userId: ref.userId };
  if (ref.tokenHash) return { tokenHash: ref.tokenHash };
  return null;
}

export async function findCart(ref: CartRef) {
  const where = whereRef(ref);
  if (!where) return null;
  return db.cart.findFirst({ where, include: { items: { orderBy: { createdAt: "asc" } } } });
}

async function ensureCart(ref: CartRef) {
  const existing = await findCart(ref);
  if (existing) return existing;
  if (!ref.userId && !ref.tokenHash) throw new AppError("VALIDATION", "Sacola indisponível.");
  return db.cart.create({
    data: ref.userId ? { userId: ref.userId } : { tokenHash: ref.tokenHash! },
    include: { items: true },
  });
}

export type AddToCartResult =
  | { ok: true; count: number }
  | { ok: false; conflict: { currentRestaurantName: string } };

/**
 * Adiciona um produto. A sacola aceita produtos de um único restaurante; se já existir outro restaurante,
 * só substitui quando `replace` for verdadeiro (confirmação explícita do cliente).
 */
export async function addToCart(
  ref: CartRef,
  input: { productId: string; quantity: number; optionIds: string[]; notes?: string | null; replace?: boolean },
): Promise<AddToCartResult> {
  const product = await db.product.findUnique({
    where: { id: input.productId },
    include: { restaurant: { select: { id: true, status: true } } },
  });
  if (!product || product.status !== "ACTIVE" || product.restaurant.status !== "APPROVED") {
    throw new AppError("NOT_FOUND", "Este produto não está disponível.");
  }
  const settings = await getSettingsUncached();
  // Valida opções e disponibilidade com as mesmas regras do checkout.
  const check = await priceLines(product.restaurantId, [input], settings.timezone);
  if (check.problems.length) throw new AppError("VALIDATION", check.problems[0].message);

  const cart = await ensureCart(ref);
  if (cart.restaurantId && cart.restaurantId !== product.restaurantId && cart.items.length > 0) {
    if (!input.replace) {
      const current = await db.restaurant.findUnique({ where: { id: cart.restaurantId }, select: { name: true } });
      return { ok: false, conflict: { currentRestaurantName: current?.name ?? "outro restaurante" } };
    }
    await db.cartItem.deleteMany({ where: { cartId: cart.id } });
    await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
  }
  const optionIds = [...new Set(input.optionIds)].sort();
  const notes = input.notes?.trim().slice(0, 300) || null;
  const same = (cart.restaurantId === product.restaurantId ? cart.items : []).find(
    (i) => i.productId === product.id && i.optionIds.slice().sort().join() === optionIds.join() && (i.notes ?? null) === notes,
  );
  if (same) {
    await db.cartItem.update({ where: { id: same.id }, data: { quantity: Math.min(50, same.quantity + input.quantity) } });
  } else {
    await db.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: input.quantity, optionIds, notes } });
  }
  await db.cart.update({ where: { id: cart.id }, data: { restaurantId: product.restaurantId } });
  const count = await db.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
  return { ok: true, count: count._sum.quantity ?? 0 };
}

export async function updateCartItem(ref: CartRef, itemId: string, quantity: number) {
  const cart = await findCart(ref);
  const item = cart?.items.find((i) => i.id === itemId);
  if (!cart || !item) throw new AppError("NOT_FOUND", "Item não encontrado na sacola.");
  if (quantity <= 0) await db.cartItem.delete({ where: { id: item.id } });
  else await db.cartItem.update({ where: { id: item.id }, data: { quantity: Math.min(50, Math.floor(quantity)) } });
}

export async function clearCart(ref: CartRef) {
  const cart = await findCart(ref);
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({ where: { id: cart.id }, data: { restaurantId: null, couponCode: null } });
}

export async function setCartCoupon(ref: CartRef, code: string | null) {
  const cart = await ensureCart(ref);
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: code ? code.trim().toUpperCase().slice(0, 40) : null } });
}

/** Junta a sacola anónima à sacola do utilizador após o início de sessão, sem perder itens. */
export async function mergeAnonymousCart(tokenHash: string, userId: string) {
  const anon = await db.cart.findUnique({ where: { tokenHash }, include: { items: true } });
  if (!anon || anon.items.length === 0) {
    if (anon) await db.cart.delete({ where: { id: anon.id } });
    return;
  }
  const userCart = await db.cart.findUnique({ where: { userId }, include: { items: true } });
  if (!userCart) {
    await db.cart.update({ where: { id: anon.id }, data: { userId, tokenHash: null } });
    return;
  }
  // A sacola mais recente prevalece quando os restaurantes diferem.
  if (userCart.items.length === 0 || userCart.restaurantId !== anon.restaurantId) {
    await db.$transaction([
      db.cartItem.deleteMany({ where: { cartId: userCart.id } }),
      db.cartItem.updateMany({ where: { cartId: anon.id }, data: { cartId: userCart.id } }),
      db.cart.update({ where: { id: userCart.id }, data: { restaurantId: anon.restaurantId, couponCode: anon.couponCode } }),
      db.cart.delete({ where: { id: anon.id } }),
    ]);
  } else {
    await db.$transaction([
      db.cartItem.updateMany({ where: { cartId: anon.id }, data: { cartId: userCart.id } }),
      db.cart.delete({ where: { id: anon.id } }),
    ]);
  }
}

/** Visão completa da sacola com preços calculados no servidor. */
export async function getCartView(ref: CartRef, opts: { neighborhoodId?: string | null } = {}) {
  const cart = await findCart(ref);
  if (!cart || !cart.restaurantId || cart.items.length === 0) return null;
  const settings = await getSettingsUncached();
  const restaurant = await db.restaurant.findUnique({
    where: { id: cart.restaurantId },
    include: { hours: true, zones: { where: { isActive: true }, include: { neighborhood: true } } },
  });
  if (!restaurant) return null;
  const priced = await priceLines(
    restaurant.id,
    cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, optionIds: i.optionIds, notes: i.notes })),
    settings.timezone,
  );
  const itemByProduct = cart.items;
  const lines = cart.items.map((item, index) => ({
    itemId: item.id,
    productId: item.productId,
    quantity: item.quantity,
    priced: priced.lines.find((l) => l.index === index) ?? null,
    problem: priced.problems.find((x) => x.index === index)?.message ?? null,
  }));
  const names = await db.product.findMany({
    where: { id: { in: itemByProduct.map((i) => i.productId) } },
    select: { id: true, name: true, imageFileId: true },
  });
  const zone = opts.neighborhoodId ? restaurant.zones.find((z) => z.neighborhoodId === opts.neighborhoodId) : null;
  let coupon: { code: string; discountCents: number; message?: string } | null = null;
  if (cart.couponCode) {
    const c = await db.coupon.findUnique({ where: { code: cart.couponCode }, include: { restaurants: { select: { id: true } } } });
    const r = await evaluateCoupon(c, {
      userId: ref.userId ?? null,
      restaurantId: restaurant.id,
      cityId: restaurant.cityId,
      subtotalCents: priced.subtotalCents,
    });
    coupon = r.ok ? { code: cart.couponCode, discountCents: r.discountCents } : { code: cart.couponCode, discountCents: 0, message: r.message };
  }
  const serviceFeeCents = computeServiceFee(priced.subtotalCents, settings);
  const deliveryFeeCents = zone ? zone.feeCents : null;
  const discountCents = coupon?.discountCents ?? 0;
  return {
    cartId: cart.id,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      minOrderCents: restaurant.minOrderCents,
      acceptsCashOnDelivery: restaurant.acceptsCashOnDelivery,
      cityId: restaurant.cityId,
      availability: restaurantAvailability(restaurant, settings.timezone),
      zones: restaurant.zones.map((z) => ({ neighborhoodId: z.neighborhoodId, name: z.neighborhood.name, feeCents: z.feeCents, etaMinutes: z.etaMinutes })),
    },
    lines: lines.map((l) => ({ ...l, name: names.find((n) => n.id === l.productId)?.name ?? "Produto", imageFileId: names.find((n) => n.id === l.productId)?.imageFileId ?? null })),
    hasProblems: priced.problems.length > 0,
    subtotalCents: priced.subtotalCents,
    serviceFeeCents,
    deliveryFeeCents,
    deliveryAvailable: opts.neighborhoodId ? !!zone : null,
    coupon,
    discountCents,
    totalCents: priced.subtotalCents - discountCents + serviceFeeCents + (deliveryFeeCents ?? 0),
    currency: settings.currency,
    itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
  };
}

export async function cartCount(ref: CartRef) {
  const where = whereRef(ref);
  if (!where) return 0;
  const cart = await db.cart.findFirst({ where, select: { id: true } });
  if (!cart) return 0;
  const agg = await db.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}
