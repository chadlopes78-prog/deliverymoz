import type { RestaurantRole, StaffRole } from "@prisma/client";

/** Permissões administrativas. As marcadas como privilegiadas só pertencem ao Super Admin. */
export const ADMIN_PERMISSIONS = [
  "dashboard.view",
  "restaurants.view",
  "restaurants.manage",
  "customers.view",
  "customers.manage",
  "couriers.view",
  "couriers.manage",
  "orders.view",
  "orders.intervene",
  "deliveries.manage",
  "finance.view",
  "finance.manage",
  "commissions.manage",
  "marketing.manage",
  "support.manage",
  "settings.manage",
  "staff.manage",
  "audit.view",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PRIVILEGED: AdminPermission[] = ["settings.manage", "staff.manage", "commissions.manage", "audit.view"];

/** Permissões que podem ser atribuídas a administradores secundários (as privilegiadas ficam sempre com o Super Admin). */
export const DELEGABLE_PERMISSIONS = ADMIN_PERMISSIONS.filter((p) => !PRIVILEGED.includes(p));

export const ADMIN_PERMISSION_LABEL: Record<AdminPermission, string> = {
  "dashboard.view": "Ver visão geral",
  "restaurants.view": "Ver restaurantes",
  "restaurants.manage": "Gerir restaurantes, produtos e aprovações",
  "customers.view": "Ver compradores e utilizadores",
  "customers.manage": "Suspender e reativar contas",
  "couriers.view": "Ver entregadores",
  "couriers.manage": "Aprovar e gerir entregadores",
  "orders.view": "Ver pedidos",
  "orders.intervene": "Intervir em pedidos",
  "deliveries.manage": "Gerir entregas",
  "finance.view": "Ver financeiro e relatórios",
  "finance.manage": "Gerir reembolsos e liquidações",
  "commissions.manage": "Gerir comissões",
  "marketing.manage": "Gerir promoções, cupões e banners",
  "support.manage": "Gerir suporte",
  "settings.manage": "Configurações da plataforma",
  "staff.manage": "Gerir administradores",
  "audit.view": "Segurança e auditoria",
};

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, AdminPermission[]> = {
  OPERATIONS: [
    "dashboard.view",
    "restaurants.view",
    "customers.view",
    "couriers.view",
    "couriers.manage",
    "orders.view",
    "orders.intervene",
    "deliveries.manage",
  ],
  FINANCE: ["dashboard.view", "restaurants.view", "orders.view", "finance.view", "finance.manage"],
  SUPPORT: [
    "dashboard.view",
    "restaurants.view",
    "customers.view",
    "customers.manage",
    "couriers.view",
    "orders.view",
    "orders.intervene",
    "support.manage",
  ],
  RESTAURANT_MANAGEMENT: [
    "dashboard.view",
    "restaurants.view",
    "restaurants.manage",
    "orders.view",
    "marketing.manage",
  ],
};

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  OPERATIONS: "Operações",
  FINANCE: "Financeiro",
  SUPPORT: "Suporte",
  RESTAURANT_MANAGEMENT: "Gestão de restaurantes",
};

export type PermissionSubject = {
  isSuperAdmin: boolean;
  status?: string;
  staff?: { role: StaffRole; isActive: boolean; permissions?: string[] } | null;
};

export function hasAdminPermission(u: PermissionSubject | null | undefined, p: AdminPermission): boolean {
  if (!u || (u.status && u.status !== "ACTIVE")) return false;
  if (u.isSuperAdmin) return true;
  if (!u.staff?.isActive) return false;
  if (PRIVILEGED.includes(p)) return false;
  return staffPermissions(u.staff).includes(p);
}

/** Permissões efetivas de um administrador secundário: as personalizadas, ou as da função. */
export function staffPermissions(staff: { role: StaffRole; permissions?: string[] }): AdminPermission[] {
  const custom = (staff.permissions ?? []).filter((p): p is AdminPermission => (DELEGABLE_PERMISSIONS as string[]).includes(p));
  const base = custom.length ? custom : STAFF_ROLE_PERMISSIONS[staff.role];
  // A visão geral é a porta de entrada do painel: todos os administradores a têm.
  return Array.from(new Set<AdminPermission>(["dashboard.view", ...base]));
}

export function isAdminUser(u: PermissionSubject | null | undefined): boolean {
  return !!u && (u.isSuperAdmin || !!u.staff?.isActive);
}

/** Permissões dentro de um restaurante. */
export const RESTAURANT_PERMISSIONS = [
  "orders.manage",
  "menu.manage",
  "store.manage",
  "promotions.manage",
  "reviews.reply",
  "finance.view",
  "staff.manage",
  "payout.manage",
] as const;
export type RestaurantPermission = (typeof RESTAURANT_PERMISSIONS)[number];

export const RESTAURANT_ROLE_PERMISSIONS: Record<RestaurantRole, RestaurantPermission[]> = {
  OWNER: [...RESTAURANT_PERMISSIONS],
  MANAGER: ["orders.manage", "menu.manage", "store.manage", "promotions.manage", "reviews.reply", "finance.view"],
  ORDER_OPERATOR: ["orders.manage"],
};

export const RESTAURANT_ROLE_LABEL: Record<RestaurantRole, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  ORDER_OPERATOR: "Operador de pedidos",
};

export function hasRestaurantPermission(role: RestaurantRole | null | undefined, p: RestaurantPermission) {
  return !!role && RESTAURANT_ROLE_PERMISSIONS[role].includes(p);
}

/** Funcionalidades que exigem um restaurante aprovado. */
const NEEDS_APPROVAL: RestaurantPermission[] = ["orders.manage", "promotions.manage", "finance.view", "staff.manage", "reviews.reply", "payout.manage"];

/**
 * O que o estado do restaurante permite, independentemente da função:
 * pendente: preparar cardápio, loja e horários; rejeitado: nada; suspenso: apenas concluir pedidos em curso.
 */
export function restaurantStatusAllows(status: string, p: RestaurantPermission): boolean {
  if (status === "APPROVED") return true;
  if (status === "PENDING") return !NEEDS_APPROVAL.includes(p);
  if (status === "SUSPENDED") return p === "orders.manage";
  return false;
}

export const RESTAURANT_STATUS_BLOCK_MESSAGE: Record<string, string> = {
  PENDING: "Disponível depois de o restaurante ser aprovado pela plataforma.",
  SUSPENDED: "O restaurante está suspenso. Contacte o suporte da plataforma.",
  REJECTED: "A candidatura do restaurante não foi aprovada.",
};
