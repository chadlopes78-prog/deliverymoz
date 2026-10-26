import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin, assertRestaurantAccess, loadActiveUser } from "../authz";

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  cityId: z.string().min(1, "Escolha a cidade."),
  neighborhoodId: z.string().min(1, "Escolha o bairro."),
  street: z.string().trim().min(3, "Indique a rua.").max(200),
  reference: z.string().trim().max(300).optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function saveAddress(userId: string, addressId: string | null, raw: unknown) {
  await loadActiveUser(userId);
  const input = addressSchema.parse(raw);
  const nb = await db.neighborhood.findUnique({ where: { id: input.neighborhoodId } });
  if (!nb || nb.cityId !== input.cityId) throw new AppError("VALIDATION", "Bairro inválido.");
  if (addressId) {
    const a = await db.address.findUnique({ where: { id: addressId } });
    if (!a || a.userId !== userId) throw new AppError("NOT_FOUND", "Endereço não encontrado.");
  } else if ((await db.address.count({ where: { userId } })) >= 20) {
    throw new AppError("VALIDATION", "Limite de endereços atingido.");
  }
  const first = (await db.address.count({ where: { userId } })) === 0;
  const isDefault = input.isDefault || first;
  return db.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    const data = { ...input, reference: input.reference || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, isDefault };
    return addressId ? tx.address.update({ where: { id: addressId }, data }) : tx.address.create({ data: { ...data, userId } });
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const res = await db.address.deleteMany({ where: { id: addressId, userId } });
  if (res.count !== 1) throw new AppError("NOT_FOUND", "Endereço não encontrado.");
}

export async function toggleFavorite(userId: string, restaurantId: string) {
  await loadActiveUser(userId);
  const key = { userId_restaurantId: { userId, restaurantId } };
  const existing = await db.favorite.findUnique({ where: key });
  if (existing) {
    await db.favorite.delete({ where: key });
    return false;
  }
  const r = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true } });
  if (!r || r.status !== "APPROVED") throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
  await db.favorite.create({ data: { userId, restaurantId } });
  return true;
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await db.notification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}

export async function updateNotificationPrefs(userId: string, prefs: { notifyEmailOrders: boolean; notifyEmailMarketing: boolean; notifyInApp: boolean }) {
  await db.user.update({ where: { id: userId }, data: prefs });
}

// ─────────────────────────── Avaliações ───────────────────────────

async function recomputeRating(restaurantId: string) {
  const agg = await db.review.aggregate({ where: { restaurantId, status: "PUBLISHED" }, _avg: { rating: true }, _count: true });
  await db.restaurant.update({ where: { id: restaurantId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count } });
}

/** Avaliação apenas para pedidos próprios, entregues, e uma única vez por pedido. */
export async function createReview(userId: string, orderCode: string, rating: number, comment?: string | null) {
  await loadActiveUser(userId);
  const order = await db.order.findUnique({ where: { code: orderCode }, include: { review: true } });
  if (!order || order.customerId !== userId) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
  if (order.status !== "DELIVERED") throw new AppError("CONFLICT", "Só pode avaliar pedidos entregues.");
  if (order.review) throw new AppError("CONFLICT", "Este pedido já foi avaliado.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError("VALIDATION", "Avaliação inválida.");
  if (order.deliveredAt && Date.now() - order.deliveredAt.getTime() > 30 * 86400_000) throw new AppError("CONFLICT", "O prazo para avaliar este pedido terminou.");
  try {
    await db.review.create({ data: { orderId: order.id, restaurantId: order.restaurantId, customerId: userId, rating, comment: comment?.trim().slice(0, 1000) || null } });
  } catch {
    throw new AppError("CONFLICT", "Este pedido já foi avaliado.");
  }
  await recomputeRating(order.restaurantId);
}

export async function replyToReview(userId: string, restaurantId: string, reviewId: string, reply: string) {
  await assertRestaurantAccess(userId, restaurantId, "reviews.reply");
  const r = await db.review.findUnique({ where: { id: reviewId } });
  if (!r || r.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Avaliação não encontrada.");
  await db.review.update({ where: { id: reviewId }, data: { reply: reply.trim().slice(0, 1000) || null, repliedAt: new Date() } });
}

export async function moderateReview(adminId: string, reviewId: string, status: "PUBLISHED" | "HIDDEN") {
  await assertAdmin(adminId, "restaurants.manage");
  const r = await db.review.update({ where: { id: reviewId }, data: { status } });
  await recomputeRating(r.restaurantId);
  await audit({ actorId: adminId, action: `review.${status.toLowerCase()}`, entityType: "Review", entityId: reviewId });
}
