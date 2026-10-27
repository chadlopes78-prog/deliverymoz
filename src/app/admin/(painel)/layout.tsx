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
  const G = { dash: "Dashboard", com: "Gestão comercial", people: "Pessoas", ops: "Operações", fin: "Financeiro e relatórios", mkt: "Marketing", adm: "Administração", sup: "Suporte" };
  const items: (NavItem & { perm: AdminPermission })[] = [
    { section: G.dash, href: "/admin", label: "Visão geral", icon: "LayoutDashboard", exact: true, perm: "dashboard.view" },
    { section: G.com, href: "/admin/restaurantes", label: "Restaurantes", icon: "Store", perm: "restaurants.view" },
    { section: G.com, href: "/admin/pedidos", label: "Pedidos", icon: "Receipt", perm: "orders.view" },
    { section: G.com, href: "/admin/produtos", label: "Produtos", icon: "Package", perm: "restaurants.view" },
    { section: G.com, href: "/admin/categorias", label: "Categorias", icon: "FolderTree", perm: "restaurants.view" },
    { section: G.people, href: "/admin/compradores", label: "Compradores", icon: "ShoppingBag", perm: "customers.view" },
    { section: G.people, href: "/admin/parceiros", label: "Parceiros", icon: "Handshake", perm: "restaurants.view" },
    { section: G.people, href: "/admin/utilizadores", label: "Utilizadores", icon: "Users", perm: "customers.view" },
    { section: G.ops, href: "/admin/entregadores", label: "Entregadores", icon: "Bike", perm: "couriers.view", badge: pendingCouriers },
    { section: G.ops, href: "/admin/entregas", label: "Entregas", icon: "Truck", perm: "deliveries.manage", badge: searching },
    { section: G.fin, href: "/admin/vendas", label: "Vendas e relatórios", icon: "BarChart3", perm: "finance.view" },
    { section: G.fin, href: "/admin/comissoes", label: "Comissões", icon: "Percent", perm: "commissions.manage" },
    { section: G.fin, href: "/admin/transacoes", label: "Transações", icon: "ArrowLeftRight", perm: "finance.view", badge: pendingRefunds },
    { section: G.mkt, href: "/admin/promocoes", label: "Promoções", icon: "Megaphone", perm: "marketing.manage" },
    { section: G.mkt, href: "/admin/cupons", label: "Cupões", icon: "Ticket", perm: "marketing.manage" },
    { section: G.mkt, href: "/admin/banners", label: "Banners", icon: "Image", perm: "marketing.manage" },
    { section: G.adm, href: "/admin/aprovacoes", label: "Registos pendentes", icon: "BadgeCheck", perm: "restaurants.view", badge: pendingRestaurants },
    { section: G.adm, href: "/admin/administradores", label: "Administradores e permissões", icon: "UserCog", perm: "staff.manage" },
    { section: G.adm, href: "/admin/atividade", label: "Atividade da plataforma", icon: "Activity", perm: "dashboard.view" },
    { section: G.adm, href: "/admin/configuracoes", label: "Configurações", icon: "Settings", perm: "settings.manage" },
    { section: G.adm, href: "/admin/auditoria", label: "Segurança e auditoria", icon: "ShieldCheck", perm: "audit.view" },
    { section: G.sup, href: "/admin/reclamacoes", label: "Reclamações", icon: "MessageSquareWarning", perm: "support.manage", badge: openComplaints },
    { section: G.sup, href: "/admin/pedidos-de-ajuda", label: "Pedidos de ajuda", icon: "CircleHelp", perm: "support.manage", badge: openTickets - openComplaints },
  ];
  const nav = items.filter((i) => hasAdminPermission(user, i.perm)).map(({ perm: _p, ...i }) => i);
  return (
    <DashboardShell
      variant="admin"
      brand={<Logo href="/admin" />}
      title="Centro de controlo"
      subtitle={user.isSuperAdmin ? `${user.name} · Super Admin` : `${user.name} · Administrador`}
      nav={nav}
      logoutAction={adminLogoutAction}
      footerLinks={[{ href: "/", label: "Ver o site" }, ...(user.restaurantMembers.length ? [{ href: "/parceiro", label: "Painel do meu restaurante" }] : [])]}
    >
      {children}
    </DashboardShell>
  );
}
