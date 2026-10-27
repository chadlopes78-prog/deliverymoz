import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "./auth/session";
import { hasAdminPermission, hasRestaurantPermission, restaurantStatusAllows, isAdminUser, type AdminPermission, type RestaurantPermission } from "./permissions";
import type { RestaurantRole } from "@prisma/client";
import { ownerExists } from "./services/accounts";

export async function requireUser(next = "/"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return user;
}

/**
 * Área administrativa: sem sessão → login administrativo; sessão sem funções administrativas → acesso recusado.
 */
export async function requireAdmin(permission: AdminPermission = "dashboard.view"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdminUser(user)) {
    // Sem proprietário ainda criado, o login administrativo oferece a ativação (com código do servidor).
    redirect((await ownerExists()) ? "/admin/sem-acesso" : "/admin/login");
  }
  if (!hasAdminPermission(user, permission)) redirect("/admin?sem-permissao=1");
  return user;
}

export const PARTNER_COOKIE = "dm_rid";

export type PartnerContext = { user: SessionUser; restaurantId: string; restaurantName: string; restaurantStatus: string; role: RestaurantRole };

/** Contexto do painel do restaurante. O restaurante ativo é sempre verificado contra as associações do utilizador. */
export async function requirePartner(permission?: RestaurantPermission): Promise<PartnerContext> {
  const user = await requireUser("/parceiro");
  const memberships = user.restaurantMembers;
  if (!memberships.length) redirect("/parceiro/registo");
  const jar = await cookies();
  const wanted = jar.get(PARTNER_COOKIE)?.value;
  const m = memberships.find((x) => x.restaurantId === wanted) ?? memberships[0];
  if (permission && !hasRestaurantPermission(m.role, permission)) redirect("/parceiro?sem-permissao=1");
  if (permission && !restaurantStatusAllows(m.restaurant.status, permission)) redirect("/parceiro?estado=1");
  return { user, restaurantId: m.restaurantId, restaurantName: m.restaurant.name, restaurantStatus: m.restaurant.status, role: m.role };
}

export async function requireCourierUser() {
  const user = await requireUser("/entregador");
  if (!user.courier) redirect("/entregador/registo");
  return user;
}
