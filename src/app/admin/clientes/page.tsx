import type { Prisma, UserStatus } from "@prisma/client";
import { Users } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { UserStatusBadge } from "@/components/admin/restaurant-status";
import { formatDate } from "@/components/status";
import { formatPhone } from "@/lib/utils";

export const metadata = { title: "Clientes" };

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; pagina?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("customers.view");
  const { page, pageSize, skip, take } = pageParams(sp);
  const digits = sp.q?.replace(/\D/g, "");
  const where: Prisma.UserWhereInput = {
    isSuperAdmin: false,
    ...(sp.estado ? { status: sp.estado as UserStatus } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, ...(digits ? [{ phone: { contains: digits } }] : [])] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true, _count: { select: { orders: true } }, staff: { select: { role: true } }, courier: { select: { id: true } }, restaurantMembers: { select: { id: true }, take: 1 } } }),
    db.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Clientes e contas" description="Pesquise contas, consulte o histórico e gira o estado das contas." />
      <FilterBar action="/admin/clientes" q={sp.q} qPlaceholder="Nome, e-mail ou telefone" clearHref="/admin/clientes">
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={[["ACTIVE", "Ativas"], ["SUSPENDED", "Suspensas"], ["CLOSED", "Encerradas"]]} />
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/clientes/${r.id}`}
        empty={<EmptyState icon={Users} title={sp.q ? "Nenhuma conta encontrada" : "Ainda não existem clientes"} />}
        columns={[
          { key: "name", header: "Nome", cell: (r) => r.name },
          { key: "email", header: "E-mail", cell: (r) => r.email ?? "—" },
          { key: "phone", header: "Telefone", cell: (r) => formatPhone(r.phone) || "—", hideOnMobile: true },
          { key: "roles", header: "Perfis", cell: (r) => [r.staff && "Funcionário", r.courier && "Entregador", r.restaurantMembers.length && "Restaurante"].filter(Boolean).join(", ") || "Cliente" },
          { key: "orders", header: "Pedidos", cell: (r) => r._count.orders },
          { key: "status", header: "Estado", cell: (r) => <UserStatusBadge status={r.status} /> },
          { key: "created", header: "Registo", cell: (r) => formatDate(r.createdAt, { dateStyle: "short" }), hideOnMobile: true },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/clientes" params={{ q: sp.q, estado: sp.estado }} />
    </>
  );
}
