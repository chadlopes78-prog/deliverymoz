import type { CourierStatus, Prisma } from "@prisma/client";
import { Bike } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { CourierStatusBadge, COURIER_STATUS_LABEL } from "@/components/admin/restaurant-status";
import { Badge } from "@/components/ui/badge";
import { VEHICLE_LABEL } from "@/server/services/couriers";
import { formatDate } from "@/components/status";

export const metadata = { title: "Entregadores" };

export default async function AdminCouriers({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; cidade?: string; pagina?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("couriers.view");
  const { page, pageSize, skip, take } = pageParams(sp);
  const where: Prisma.CourierWhereInput = {
    ...(sp.estado ? { status: sp.estado as CourierStatus } : {}),
    ...(sp.cidade ? { cityId: sp.cidade } : {}),
    ...(sp.q ? { user: { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q.replace(/\D/g, "") || sp.q } }] } } : {}),
  };
  const [rows, total, cities] = await Promise.all([
    db.courier.findMany({ where, skip, take, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { user: { select: { name: true, phone: true } }, city: true, _count: { select: { deliveries: { where: { status: "DELIVERED" } } } } } }),
    db.courier.count({ where }),
    db.city.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Entregadores" description="Candidaturas, documentos, disponibilidade e desempenho." />
      <FilterBar action="/admin/entregadores" q={sp.q} qPlaceholder="Nome, e-mail ou telefone" clearHref="/admin/entregadores">
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={Object.entries(COURIER_STATUS_LABEL)} />
        <FilterSelect name="cidade" value={sp.cidade} label="Todas as cidades" options={cities.map((c) => [c.id, c.name])} />
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/entregadores/${r.id}`}
        empty={<EmptyState icon={Bike} title="Ainda não existem entregadores" description="As candidaturas aparecem aqui para aprovação." />}
        columns={[
          { key: "name", header: "Nome", cell: (r) => r.user.name },
          { key: "city", header: "Cidade", cell: (r) => r.city.name },
          { key: "vehicle", header: "Veículo", cell: (r) => VEHICLE_LABEL[r.vehicleType] },
          { key: "status", header: "Estado", cell: (r) => <CourierStatusBadge status={r.status} /> },
          { key: "avail", header: "Disponível", cell: (r) => r.status === "APPROVED" ? <Badge tone={r.isAvailable ? "green" : "neutral"}>{r.isAvailable ? "Sim" : "Não"}</Badge> : "—" },
          { key: "deliv", header: "Entregas", cell: (r) => r._count.deliveries },
          { key: "created", header: "Candidatura", cell: (r) => formatDate(r.createdAt, { dateStyle: "short" }), hideOnMobile: true },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/entregadores" params={{ q: sp.q, estado: sp.estado, cidade: sp.cidade }} />
    </>
  );
}
