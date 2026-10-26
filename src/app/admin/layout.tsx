import type { Metadata } from "next";
import { requireAdmin } from "@/server/guards";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { Logo } from "@/components/logo";
import { hasAdminPermission, type AdminPermission } from "@/server/permissions";
import { db } from "@/server/db";
import { adminLogoutAction } from "./actions";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Administração" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin("dashboard.view");
  const [pendingRestaurants, pendingCouriers, openTickets, searching, pendingRefunds] = await Promise.all([
    db.restaurant.count({ where: { status: "PENDING" } }),
    db.courier.count({ where: { status: "PENDING" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.delivery.count({ where: { status: "SEARCHING", order: { status: { in: ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] } } } }),
    db.refund.count({ where: { status: "PENDING" } }),
  ]);
  const items: (NavItem & { perm: AdminPermission })[] = [
    { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", exact: true, perm: "dashboard.view" },
    { href: "/admin/pedidos", label: "Pedidos", icon: "Receipt", perm: "orders.view" },
    { href: "/admin/entregas", label: "Entregas", icon: "Truck", perm: "deliveries.manage", badge: searching },
    { href: "/admin/restaurantes", label: "Restaurantes", icon: "Store", perm: "restaurants.view", badge: pendingRestaurants },
    { href: "/admin/clientes", label: "Clientes", icon: "Users", perm: "customers.view" },
    { href: "/admin/entregadores", label: "Entregadores", icon: "Bike", perm: "couriers.view", badge: pendingCouriers },
    { href: "/admin/financeiro", label: "Financeiro", icon: "Wallet", perm: "finance.view", badge: pendingRefunds },
    { href: "/admin/comissoes", label: "Comissões", icon: "Percent", perm: "commissions.manage" },
    { href: "/admin/promocoes", label: "Promoções e banners", icon: "Megaphone", perm: "marketing.manage" },
    { href: "/admin/cupons", label: "Cupões", icon: "Ticket", perm: "marketing.manage" },
    { href: "/admin/suporte", label: "Suporte", icon: "LifeBuoy", perm: "support.manage", badge: openTickets },
    { href: "/admin/funcionarios", label: "Funcionários", icon: "UserCog", perm: "staff.manage" },
    { href: "/admin/configuracoes", label: "Configurações", icon: "Settings", perm: "settings.manage" },
    { href: "/admin/auditoria", label: "Auditoria", icon: "ScrollText", perm: "audit.view" },
  ];
  const nav = items.filter((i) => hasAdminPermission(user, i.perm)).map(({ perm: _p, ...i }) => i);
  return (
    <DashboardShell brand={<Logo href="/admin" />} title="Administração" subtitle={user.isSuperAdmin ? "Super Admin" : user.name} nav={nav} logoutAction={adminLogoutAction}>
      {children}
    </DashboardShell>
  );
}
