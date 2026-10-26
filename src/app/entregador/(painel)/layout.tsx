import type { Metadata } from "next";
import { requireCourierUser } from "@/server/guards";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { Logo } from "@/components/logo";
import { db } from "@/server/db";
import { courierLogoutAction } from "../actions";

export const metadata: Metadata = { title: { default: "Entregador", template: "%s · Entregador" }, robots: { index: false, follow: false } };

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCourierUser();
  const offers = await db.deliveryOffer.count({ where: { courier: { userId: user.id }, status: "OFFERED", expiresAt: { gt: new Date() } } });
  const nav: NavItem[] = [
    { href: "/entregador", label: "Início", icon: "Home", exact: true },
    { href: "/entregador/entregas", label: "Entregas", icon: "Bike", badge: offers },
    { href: "/entregador/historico", label: "Histórico", icon: "History" },
    { href: "/entregador/perfil", label: "Perfil", icon: "User" },
    { href: "/entregador/documentos", label: "Documentos", icon: "FileText" },
    { href: "/entregador/configuracoes", label: "Configurações", icon: "Settings" },
  ];
  return (
    <DashboardShell brand={<Logo href="/entregador" />} title="Entregador" subtitle={user.name} nav={nav} logoutAction={courierLogoutAction} bottomNav={nav.slice(0, 4)}>
      {children}
    </DashboardShell>
  );
}
