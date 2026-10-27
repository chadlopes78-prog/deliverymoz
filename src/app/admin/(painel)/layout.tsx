import type { Metadata } from "next";
import { requireAdmin } from "@/server/guards";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { Logo } from "@/components/logo";
import { hasAdminPermission, type AdminPermission } from "@/server/permissions";
import { db } from "@/server/db";
import { adminLogoutAction } from "@/app/admin/actions";
import { COMPLAINT_CATEGORIES } from "@/server/services/support";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Administração" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin("dashboard.view");
  const [pendingRestaurants, pendingCouriers, openTickets, searching, pendingRefunds, openComplaints] = await Promise.all([
    db.restaurant.count({ where: { status: "PENDING" } }),
    db.courier.count({ where: { status: "PENDING" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.delivery.count({ where: { status: "SEARCHING", order: { status: { in: ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] } } } }),
    db.refund.count({ where: { status: "PENDING" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, category: { in: COMPLAINT_CATEGORIES } } }),
  ]);
  const G = { dash: "Dashboard", com: "Gestão comercial", ops: "Operações", fin: "Financeiro", mkt: "Marketing", adm: "Administração", sup: "Suporte" };
  const items: (NavItem & { perm: AdminPermission })[] = [
    { section: G.dash, href: "/admin", label: "Visão geral", icon: "LayoutDashboard", exact: true, perm: "dashboard.view" },
    { section: G.com, href: "/admin/restaurantes", label: "Restaurantes", icon: "Store", perm: "restaurants.view" },
    { section: G.com, href: "/admin/produtos", label: "Produtos", icon: "Package", perm: "restaurants.view" },
    { section: G.com, href: "/admin/categorias", label: "Categorias", icon: "FolderTree", perm: "restaurants.view" },
    { section: G.com, href: "/admin/pedidos", label: "Pedidos", icon: "Receipt", perm: "orders.view" },
    { section: G.ops, href: "/admin/entregadores", label: "Entregadores", icon: "Bike", perm: "couriers.view" },
    { section: G.ops, href: "/admin/clientes", label: "Clientes", icon: "Users", perm: "customers.view" },
    { section: G.ops, href: "/admin/entregas", label: "Entregas", icon: "Truck", perm: "deliveries.manage", badge: searching },
    { section: G.fin, href: "/admin/vendas", label: "Vendas", icon: "BarChart3", perm: "finance.view" },
    { section: G.fin, href: "/admin/comissoes", label: "Comissões", icon: "Percent", perm: "commissions.manage" },
    { section: G.fin, href: "/admin/transacoes", label: "Transações", icon: "ArrowLeftRight", perm: "finance.view", badge: pendingRefunds },
    { section: G.mkt, href: "/admin/promocoes", label: "Promoções", icon: "Megaphone", perm: "marketing.manage" },
    { section: G.mkt, href: "/admin/cupons", label: "Cupões", icon: "Ticket", perm: "marketing.manage" },
    { section: G.mkt, href: "/admin/banners", label: "Banners", icon: "Image", perm: "marketing.manage" },
    { section: G.adm, href: "/admin/aprovacoes", label: "Aprovação de restaurantes", icon: "BadgeCheck", perm: "restaurants.view", badge: pendingRestaurants + pendingCouriers },
    { section: G.adm, href: "/admin/funcionarios", label: "Utilizadores e permissões", icon: "UserCog", perm: "staff.manage" },
    { section: G.adm, href: "/admin/configuracoes", label: "Configurações", icon: "Settings", perm: "settings.manage" },
    { section: G.adm, href: "/admin/auditoria", label: "Segurança e auditoria", icon: "ShieldCheck", perm: "audit.view" },
    { section: G.sup, href: "/admin/reclamacoes", label: "Reclamações", icon: "MessageSquareWarning", perm: "support.manage", badge: openComplaints },
    { section: G.sup, href: "/admin/pedidos-de-ajuda", label: "Pedidos de ajuda", icon: "CircleHelp", perm: "support.manage", badge: openTickets - openComplaints },
  ];
  const nav = items.filter((i) => hasAdminPermission(user, i.perm)).map(({ perm: _p, ...i }) => i);
  return (
    <DashboardShell brand={<Logo href="/admin" />} title="Administração" subtitle={user.isSuperAdmin ? "Super Admin" : user.name} nav={nav} logoutAction={adminLogoutAction}>
      {children}
    </DashboardShell>
  );
}
