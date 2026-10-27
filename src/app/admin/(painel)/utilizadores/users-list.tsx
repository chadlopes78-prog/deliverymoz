import type { Prisma, UserStatus } from "@prisma/client";
import { Users } from "lucide-react";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { RefreshButton } from "@/components/refresh-button";
import { UserStatusBadge, USER_STATUS_LABEL } from "@/components/admin/restaurant-status";
import { formatDate } from "@/components/status";
import { formatPhone } from "@/lib/utils";

export type UsersSP = { q?: string; estado?: string; perfil?: string; pagina?: string };

export const PROFILE_LABEL = { comprador: "Comprador", parceiro: "Parceiro", entregador: "Entregador", administrador: "Administrador" } as const;
type Profile = keyof typeof PROFILE_LABEL;

/** Filtro por perfil, derivado das relações reais da conta (não de um campo editável pelo utilizador). */
export function profileWhere(p?: string): Prisma.UserWhereInput {
  switch (p as Profile) {
    case "comprador": return { isSuperAdmin: false, staff: null, courier: null, restaurantMembers: { none: {} } };
    case "parceiro": return { restaurantMembers: { some: {} } };
    case "entregador": return { courier: { isNot: null } };
    case "administrador": return { OR: [{ isSuperAdmin: true }, { staff: { isNot: null } }] };
    default: return {};
  }
}

export async function UsersList({ sp, base, title, description, fixedProfile }: { sp: UsersSP; base: string; title: string; description: string; fixedProfile?: Profile }) {
  const { page, pageSize, skip, take } = pageParams(sp);
  const digits = sp.q?.replace(/\D/g, "");
  const profile = fixedProfile ?? sp.perfil;
  const where: Prisma.UserWhereInput = {
    AND: [
      profileWhere(profile),
      sp.estado && sp.estado in USER_STATUS_LABEL ? { status: sp.estado as UserStatus } : {},
      sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, ...(digits ? [{ phone: { contains: digits } }] : [])] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, skip, take, orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true, isSuperAdmin: true,
        _count: { select: { orders: true } }, staff: { select: { isActive: true } }, courier: { select: { id: true } }, restaurantMembers: { select: { id: true }, take: 1 },
      },
    }),
    db.user.count({ where }),
  ]);
  const filtered = !!(sp.q || sp.estado || (!fixedProfile && sp.perfil));
  return (
    <>
      <PageHeader title={title} description={description} actions={<RefreshButton />} />
      <FilterBar action={base} q={sp.q} qPlaceholder="Nome, e-mail ou telefone" clearHref={base}>
        {!fixedProfile && <FilterSelect name="perfil" value={sp.perfil} label="Todos os perfis" options={Object.entries(PROFILE_LABEL)} />}
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={Object.entries(USER_STATUS_LABEL)} />
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/utilizadores/${r.id}`}
        empty={<EmptyState icon={Users} title={filtered ? "Nenhuma conta encontrada" : fixedProfile === "comprador" ? "Ainda não existem compradores registados" : "Ainda não existem contas"} description={filtered ? "Ajuste a pesquisa ou os filtros." : "As contas aparecem aqui quando as pessoas se registam no site."} />}
        columns={[
          { key: "name", header: "Nome", cell: (r) => r.name },
          { key: "email", header: "E-mail", cell: (r) => r.email ?? "—" },
          { key: "phone", header: "Telefone", cell: (r) => formatPhone(r.phone) || "—", hideOnMobile: true },
          {
            key: "roles", header: "Perfis",
            cell: (r) => (
              <span className="flex flex-wrap justify-end gap-1 md:justify-start">
                {r.isSuperAdmin && <Badge tone="brand">Super Admin</Badge>}
                {r.staff && <Badge tone="blue">Administrador</Badge>}
                {r.restaurantMembers.length > 0 && <Badge tone="green">Parceiro</Badge>}
                {r.courier && <Badge>Entregador</Badge>}
                {!r.isSuperAdmin && !r.staff && !r.restaurantMembers.length && !r.courier && <Badge>Comprador</Badge>}
              </span>
            ),
          },
          { key: "orders", header: "Pedidos", cell: (r) => r._count.orders },
          { key: "status", header: "Estado", cell: (r) => <UserStatusBadge status={r.status} /> },
          { key: "created", header: "Registo", cell: (r) => formatDate(r.createdAt, { dateStyle: "short" }), hideOnMobile: true },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref={base} params={{ q: sp.q, estado: sp.estado, perfil: fixedProfile ? undefined : sp.perfil }} />
    </>
  );
}
