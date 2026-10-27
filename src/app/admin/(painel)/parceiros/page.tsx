import Link from "next/link";
import type { Prisma, RestaurantStatus } from "@prisma/client";
import { Handshake } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { RefreshButton } from "@/components/refresh-button";
import { buttonClass } from "@/components/ui/button-class";
import { UserStatusBadge, RestaurantOperationalBadge, RESTAURANT_STATUS_LABEL } from "@/components/admin/restaurant-status";
import { RESTAURANT_ROLE_LABEL } from "@/server/permissions";
import { formatDate } from "@/components/status";
import { formatPhone } from "@/lib/utils";

export const metadata = { title: "Parceiros" };

/** Contas de parceiros (donos e equipas de restaurantes), com os restaurantes associados e o respetivo estado. */
export default async function AdminPartners({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; pagina?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("restaurants.view");
  const { page, pageSize, skip, take } = pageParams(sp);
  const restaurantStatus = sp.estado && sp.estado in RESTAURANT_STATUS_LABEL ? (sp.estado as RestaurantStatus) : null;
  const where: Prisma.UserWhereInput = {
    restaurantMembers: { some: restaurantStatus ? { restaurant: { status: restaurantStatus } } : {} },
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { restaurantMembers: { some: { restaurant: { name: { contains: sp.q, mode: "insensitive" } } } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, skip, take, orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true,
        restaurantMembers: {
          select: { id: true, role: true, isActive: true, restaurant: { select: { id: true, name: true, status: true, acceptingOrders: true, _count: { select: { orders: true, products: { where: { status: "ACTIVE" } } } } } } },
        },
      },
    }),
    db.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Parceiros" description="Contas de donos e equipas de restaurantes. Aprove registos em Registos pendentes e gira cada restaurante na sua ficha." actions={<><RefreshButton /><Link href="/admin/aprovacoes" className={buttonClass("outline", "sm")}>Registos pendentes</Link></>} />
      <FilterBar action="/admin/parceiros" q={sp.q} qPlaceholder="Nome, e-mail ou restaurante" clearHref="/admin/parceiros">
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados do restaurante" options={Object.entries(RESTAURANT_STATUS_LABEL)} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState icon={Handshake} title={sp.q || sp.estado ? "Nenhum parceiro encontrado" : "Ainda não existem parceiros"} description="Os parceiros aparecem quando registam um restaurante em /parceiro/registo ou quando associa uma conta a um restaurante." />
      ) : (
        <ul className="space-y-3">
          {rows.map((u) => (
            <li key={u.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/utilizadores/${u.id}`} className="font-semibold hover:text-brand">{u.name}</Link>
                  <p className="truncate text-sm text-muted">{u.email ?? "—"} · {formatPhone(u.phone) || "—"} · registo {formatDate(u.createdAt, { dateStyle: "short" })}</p>
                </div>
                <UserStatusBadge status={u.status} />
              </div>
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {u.restaurantMembers.map((m) => (
                  <li key={m.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <Link href={`/admin/restaurantes/${m.restaurant.id}`} className="font-semibold hover:text-brand">{m.restaurant.name}</Link>
                      <span className="ml-2 text-muted">{RESTAURANT_ROLE_LABEL[m.role]}{!m.isActive && " (inativo)"}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <RestaurantOperationalBadge status={m.restaurant.status} acceptingOrders={m.restaurant.acceptingOrders} />
                      <Badge>{m.restaurant._count.products} produtos</Badge>
                      <Badge>{m.restaurant._count.orders} pedidos</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/parceiros" params={{ q: sp.q, estado: sp.estado }} />
    </>
  );
}
