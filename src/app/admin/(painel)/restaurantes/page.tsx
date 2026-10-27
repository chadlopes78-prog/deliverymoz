import Link from "next/link";
import type { Prisma, RestaurantStatus } from "@prisma/client";
import { Plus, Store } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button-class";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { RestaurantStatusBadge, RESTAURANT_STATUS_LABEL } from "@/components/admin/restaurant-status";
import { formatDate } from "@/components/status";
import { Thumb } from "@/components/public/restaurant-card";

export const metadata = { title: "Restaurantes" };

export default async function AdminRestaurants({ searchParams }: { searchParams: Promise<{ q?: string; cidade?: string; estado?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin("restaurants.view");
  const { page, pageSize, skip, take } = pageParams(sp);
  const where: Prisma.RestaurantWhereInput = {
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }] } : {}),
    ...(sp.cidade ? { cityId: sp.cidade } : {}),
    ...(sp.estado ? { status: sp.estado as RestaurantStatus } : {}),
  };
  const [rows, total, cities] = await Promise.all([
    db.restaurant.findMany({ where, skip, take, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { city: true, _count: { select: { orders: true, products: { where: { status: "ACTIVE" } } } } } }),
    db.restaurant.count({ where }),
    db.city.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Restaurantes" description="Candidaturas, aprovações e gestão comercial." actions={hasAdminPermission(user, "restaurants.manage") ? <Link href="/admin/restaurantes/novo" className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" /> Adicionar restaurante</Link> : null} />
      <FilterBar action="/admin/restaurantes" q={sp.q} qPlaceholder="Nome, e-mail ou telefone" clearHref="/admin/restaurantes">
        <FilterSelect name="cidade" value={sp.cidade} label="Todas as cidades" options={cities.map((c) => [c.id, c.name])} />
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={Object.entries(RESTAURANT_STATUS_LABEL)} />
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/restaurantes/${r.id}`}
        empty={<EmptyState icon={Store} title={sp.q || sp.estado || sp.cidade ? "Nenhum restaurante encontrado" : "Ainda não existem restaurantes"} description="Adicione restaurantes ou aguarde candidaturas de parceiros." />}
        columns={[
          { key: "name", header: "Restaurante", cell: (r) => <span className="flex items-center gap-2"><Thumb id={r.logoFileId} name={r.name} size="sm" />{r.name}</span> },
          { key: "city", header: "Cidade", cell: (r) => r.city.name },
          { key: "status", header: "Estado", cell: (r) => <RestaurantStatusBadge status={r.status} /> },
          { key: "products", header: "Produtos ativos", cell: (r) => r._count.products },
          { key: "orders", header: "Pedidos", cell: (r) => r._count.orders },
          { key: "created", header: "Registo", cell: (r) => formatDate(r.createdAt, { dateStyle: "short" }), hideOnMobile: true },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/restaurantes" params={{ q: sp.q, cidade: sp.cidade, estado: sp.estado }} />
    </>
  );
}
