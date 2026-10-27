import type { Metadata } from "next";
import { requirePartner } from "@/server/guards";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { Logo } from "@/components/logo";
import { hasRestaurantPermission, restaurantStatusAllows, isAdminUser, type RestaurantPermission } from "@/server/permissions";
import { db } from "@/server/db";
import { partnerLogoutAction, pauseStoreAction } from "../actions";
import { ActionForm } from "@/components/ui/action-form";

export const metadata: Metadata = { title: { default: "Painel do restaurante", template: "%s · Painel do restaurante" }, robots: { index: false, follow: false } };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePartner();
  const [pending, store] = await Promise.all([
    db.order.count({ where: { restaurantId: ctx.restaurantId, status: "PLACED" } }),
    db.restaurant.findUnique({ where: { id: ctx.restaurantId }, select: { acceptingOrders: true, status: true } }),
  ]);
  const canToggle = store?.status === "APPROVED" && hasRestaurantPermission(ctx.role, "orders.manage");
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
  // O menu mostra só o que a função e o estado do restaurante permitem (o servidor verifica o mesmo em cada página e ação).
  const nav = items.filter((i) => !i.perm || (hasRestaurantPermission(ctx.role, i.perm) && restaurantStatusAllows(ctx.restaurantStatus, i.perm))).map(({ perm: _p, ...i }) => i);
  const bottom = nav.filter((i) => ["/parceiro", "/parceiro/pedidos", "/parceiro/cardapio", "/parceiro/loja"].includes(i.href));
  return (
    <DashboardShell
      variant="partner"
      brand={<Logo href="/parceiro" />}
      title="Painel do restaurante"
      subtitle={ctx.restaurantName}
      nav={nav}
      logoutAction={partnerLogoutAction}
      bottomNav={bottom}
      sidebarExtra={canToggle ? (
        <ActionForm action={pauseStoreAction} confirmMessage={store!.acceptingOrders ? "Pausar a receção de novos pedidos?" : undefined}>
          <input type="hidden" name="accepting" value={store!.acceptingOrders ? "false" : "true"} />
          <button className="flex w-full items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-ink/5" aria-label={store!.acceptingOrders ? "Loja aberta: pausar pedidos" : "Loja pausada: retomar pedidos"}>
            <span className="flex items-center gap-2"><span className={store!.acceptingOrders ? "h-2.5 w-2.5 rounded-full bg-accent" : "h-2.5 w-2.5 rounded-full bg-ink/30"} />{store!.acceptingOrders ? "Aberto para pedidos" : "Loja pausada"}</span>
            <span className={store!.acceptingOrders ? "relative h-5 w-9 rounded-full bg-accent" : "relative h-5 w-9 rounded-full bg-ink/20"} aria-hidden><span className={store!.acceptingOrders ? "absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white" : "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white"} /></span>
          </button>
        </ActionForm>
      ) : null}
      footerLinks={[{ href: "/", label: "Ver o site" }, ...(isAdminUser(ctx.user) ? [{ href: "/admin", label: "Centro de controlo" }] : [])]}
    >
      {children}
    </DashboardShell>
  );
}
