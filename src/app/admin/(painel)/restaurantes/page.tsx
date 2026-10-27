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
import { RefreshButton } from "@/components/refresh-button";
import { RestaurantOperationalBadge, RESTAURANT_STATUS_LABEL } from "@/components/admin/restaurant-status";
import { RestaurantStatusActions } from "@/components/admin/restaurant-actions";
import { formatDate } from "@/components/status";
import { Thumb } from "@/components/public/restaurant-card";

export const metadata = { title: "Restaurantes" };

const STATUS_OPTIONS: [string, string][] = [["ATIVO", "Ativo"], ["PAUSADO", "Pausado"], ["DESPUBLICADO", "Despublicado"], ...Object.entries(RESTAURANT_STATUS_LABEL).filter(([k]) => k !== "APPROVED")];

function statusWhere(v?: string): Prisma.RestaurantWhereInput {
  if (v === "ATIVO") return { status: "APPROVED", acceptingOrders: true, isListed: true };
  if (v === "PAUSADO") return { status: "APPROVED", acceptingOrders: false, isListed: true };
  if (v === "DESPUBLICADO") return { status: "APPROVED", isListed: false };
  if (v && v in RESTAURANT_STATUS_LABEL) return { status: v as RestaurantStatus };
  return {};
}

export default async function AdminRestaurants({ searchParams }: { searchParams: Promise<{ q?: string; cidade?: string; estado?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin("restaurants.view");
  const manage = hasAdminPermission(user, "restaurants.manage");
  const { page, pageSize, skip, take } = pageParams(sp);
  const where: Prisma.RestaurantWhereInput = {
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { responsibleName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }] } : {}),
    ...(sp.cidade ? { cityId: sp.cidade } : {}),
    ...statusWhere(sp.estado),
  };
  const [rows, total, cities] = await Promise.all([
    db.restaurant.findMany({ where, skip, take, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { city: true, neighborhood: true } }),
    db.restaurant.count({ where }),
    db.city.findMany({ orderBy: { name: "asc" } }),
  ]);
  const filtered = !!(sp.q || sp.estado || sp.cidade);
  return (
    <>
      <PageHeader
        title="Gestão de restaurantes"
        description="Registo, aprovação, edição e estado operacional dos restaurantes."
        actions={<><RefreshButton />{manage && <Link href="/admin/restaurantes/novo" className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" /> Adicionar restaurante</Link>}</>}
      />
      <FilterBar action="/admin/restaurantes" q={sp.q} qPlaceholder="Nome, responsável, e-mail ou telefone" clearHref="/admin/restaurantes">
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={STATUS_OPTIONS} />
        <FilterSelect name="cidade" value={sp.cidade} label="Todas as cidades" options={cities.map((c) => [c.id, c.name])} />
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/restaurantes/${r.id}`}
        empty={
          <EmptyState
            icon={Store}
            title={filtered ? "Nenhum restaurante encontrado" : "Ainda não existem restaurantes"}
            description={filtered ? "Ajuste a pesquisa ou os filtros." : "Adicione o primeiro restaurante ou aguarde candidaturas de parceiros."}
            action={!filtered && manage ? <Link href="/admin/restaurantes/novo" className={buttonClass()}><Plus className="h-4 w-4" /> Adicionar restaurante</Link> : undefined}
          />
        }
        columns={[
          { key: "name", header: "Restaurante", cell: (r) => <span className="flex min-w-0 items-center gap-2"><Thumb id={r.logoFileId} name={r.name} size="sm" /><span className="truncate">{r.name}</span></span> },
          { key: "resp", header: "Responsável", cell: (r) => r.responsibleName },
          { key: "city", header: "Cidade", cell: (r) => r.city.name },
          { key: "nb", header: "Bairro", cell: (r) => r.neighborhood?.name ?? "—", hideOnMobile: true },
          { key: "status", header: "Estado", cell: (r) => <RestaurantOperationalBadge status={r.status} acceptingOrders={r.acceptingOrders} isListed={r.isListed} /> },
          { key: "created", header: "Registo", cell: (r) => formatDate(r.createdAt, { dateStyle: "short" }), hideOnMobile: true },
          {
            key: "actions", header: "Ações", interactive: true,
            cell: (r) => (
              <div className="flex flex-wrap items-start justify-end gap-1.5 md:justify-start">
                <Link href={`/admin/restaurantes/${r.id}`} className={buttonClass("ghost", "sm")}>Ver</Link>
                {manage && <Link href={`/admin/restaurantes/${r.id}/editar`} className={buttonClass("outline", "sm")}>Editar</Link>}
                {manage && <RestaurantStatusActions r={r} />}
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/restaurantes" params={{ q: sp.q, cidade: sp.cidade, estado: sp.estado }} />
    </>
  );
}
