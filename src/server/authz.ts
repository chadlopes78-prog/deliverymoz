import type { RestaurantRole } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import {
  hasAdminPermission,
  hasRestaurantPermission,
  type AdminPermission,
  type RestaurantPermission,
} from "./permissions";

/** Carrega o utilizador e verifica que a conta está ativa. */
export async function loadActiveUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, status: true, isSuperAdmin: true, staff: true },
  });
  if (!user || user.status !== "ACTIVE") throw new AppError("UNAUTHENTICATED", "Sessão inválida.");
  return user;
}

export async function assertAdmin(userId: string, permission: AdminPermission) {
  const user = await loadActiveUser(userId);
  if (!hasAdminPermission(user, permission)) {
    throw new AppError("FORBIDDEN", "Não tem permissão para realizar esta ação.");
  }
  return user;
}

const ADMIN_OVERRIDE: RestaurantPermission[] = ["menu.manage", "store.manage"];

/**
 * Verifica, sempre na base de dados, que o utilizador pertence ao restaurante
 * com a permissão pedida. Nunca confiar num restaurantId vindo do navegador sem esta verificação.
 */
export async function assertRestaurantAccess(
  userId: string,
  restaurantId: string,
  permission: RestaurantPermission,
): Promise<{ role: RestaurantRole; restaurant: { id: string; status: string; name: string } }> {
  const user = await loadActiveUser(userId);
  // A equipa com "restaurants.manage" pode gerir o cardápio e a loja de qualquer restaurante a partir do Admin.
  // Pedidos, pagamentos, equipa e dados de liquidação continuam reservados aos membros do restaurante.
  if (ADMIN_OVERRIDE.includes(permission) && hasAdminPermission(user, "restaurants.manage")) {
    const restaurant = await db.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, status: true, name: true } });
    if (!restaurant) throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
    return { role: "MANAGER", restaurant };
  }
  const member = await db.restaurantMember.findUnique({
    where: { restaurantId_userId: { restaurantId, userId } },
    include: { restaurant: { select: { id: true, status: true, name: true } } },
  });
  if (!member || !member.isActive) throw new AppError("FORBIDDEN", "Não tem acesso a este restaurante.");
  if (!hasRestaurantPermission(member.role, permission)) {
    throw new AppError("FORBIDDEN", "A sua função neste restaurante não permite esta ação.");
  }
  return { role: member.role, restaurant: member.restaurant };
}

export async function assertApprovedCourier(userId: string) {
  await loadActiveUser(userId);
  const courier = await db.courier.findUnique({ where: { userId } });
  if (!courier) throw new AppError("FORBIDDEN", "Conta de entregador não encontrada.");
  if (courier.status !== "APPROVED") throw new AppError("FORBIDDEN", "A conta de entregador não está aprovada.");
  return courier;
}
