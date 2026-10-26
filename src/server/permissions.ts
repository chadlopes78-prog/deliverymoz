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

const PRIVILEGED: AdminPermission[] = ["settings.manage", "staff.manage", "commissions.manage", "audit.view"];

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
  staff?: { role: StaffRole; isActive: boolean } | null;
};

export function hasAdminPermission(u: PermissionSubject | null | undefined, p: AdminPermission): boolean {
  if (!u || (u.status && u.status !== "ACTIVE")) return false;
  if (u.isSuperAdmin) return true;
  if (!u.staff?.isActive) return false;
  if (PRIVILEGED.includes(p)) return false;
  return STAFF_ROLE_PERMISSIONS[u.staff.role].includes(p);
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
