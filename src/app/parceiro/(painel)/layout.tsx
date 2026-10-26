import type { Metadata } from "next";
import { requirePartner } from "@/server/guards";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { Logo } from "@/components/logo";
import { hasRestaurantPermission, type RestaurantPermission } from "@/server/permissions";
import { db } from "@/server/db";
import { partnerLogoutAction } from "../actions";

export const metadata: Metadata = { title: { default: "Painel do restaurante", template: "%s · Painel do restaurante" }, robots: { index: false, follow: false } };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePartner();
  const pending = await db.order.count({ where: { restaurantId: ctx.restaurantId, status: "PLACED" } });
  const items: (NavItem & { perm?: RestaurantPermission })[] = [
    { href: "/parceiro", label: "Início", icon: "LayoutDashboard", exact: true },
    { href: "/parceiro/pedidos", label: "Pedidos", icon: "Receipt", perm: "orders.manage", badge: pending },
    { href: "/parceiro/cardapio", label: "Cardápio", icon: "UtensilsCrossed", perm: "menu.manage" },
    { href: "/parceiro/categorias", label: "Categorias", icon: "FolderTree", perm: "menu.manage" },
    { href: "/parceiro/loja", label: "Loja", icon: "Store", perm: "store.manage" },
    { href: "/parceiro/horarios", label: "Horários", icon: "Clock", perm: "store.manage" },
    { href: "/parceiro/entregas", label: "Zonas de entrega", icon: "MapPin", perm: "store.manage" },
    { href: "/parceiro/promocoes", label: "Promoções", icon: "Tag", perm: "promotions.manage" },
    { href: "/parceiro/avaliacoes", label: "Avaliações", icon: "Star", perm: "reviews.reply" },
    { href: "/parceiro/financeiro", label: "Financeiro", icon: "Wallet", perm: "finance.view" },
    { href: "/parceiro/funcionarios", label: "Funcionários", icon: "Users", perm: "staff.manage" },
    { href: "/parceiro/configuracoes", label: "Configurações", icon: "Settings" },
  ];
  const nav = items.filter((i) => !i.perm || hasRestaurantPermission(ctx.role, i.perm)).map(({ perm: _p, ...i }) => i);
  const bottom = nav.filter((i) => ["/parceiro", "/parceiro/pedidos", "/parceiro/cardapio", "/parceiro/loja"].includes(i.href));
  return (
    <DashboardShell brand={<Logo href="/parceiro" />} title="Painel do restaurante" subtitle={ctx.restaurantName} nav={nav} logoutAction={partnerLogoutAction} bottomNav={bottom}>
      {children}
    </DashboardShell>
  );
}
