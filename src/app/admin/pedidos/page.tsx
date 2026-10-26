import type { OrderStatus, Prisma } from "@prisma/client";
import { Receipt } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { OrderStatusBadge, PaymentStatusBadge, PAYMENT_METHOD_LABEL, formatDate } from "@/components/status";
import { ORDER_STATUS_LABEL } from "@/server/services/order-state";
import { formatMoney } from "@/lib/money";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata = { title: "Pedidos" };

type SP = { q?: string; estado?: string; restaurante?: string; cliente?: string; de?: string; ate?: string; pagamento?: string; pagina?: string };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  await requireAdmin("orders.view");
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const q = sp.q?.trim();
  const where: Prisma.OrderWhereInput = {
    ...(q ? { OR: [{ code: { equals: q.replace(/^#/, "").toUpperCase() } }, { customerName: { contains: q, mode: "insensitive" } }, { customerPhone: { contains: q.replace(/\D/g, "") || q } }, { customer: { email: { contains: q, mode: "insensitive" } } }] } : {}),
    ...(sp.estado ? { status: sp.estado as OrderStatus } : {}),
    ...(sp.restaurante ? { restaurantId: sp.restaurante } : {}),
    ...(sp.cliente ? { customerId: sp.cliente } : {}),
    ...(sp.pagamento ? { paymentMethod: sp.pagamento as "MPESA" } : {}),
    ...(sp.de || sp.ate ? { createdAt: { ...(sp.de ? { gte: new Date(`${sp.de}T00:00:00`) } : {}), ...(sp.ate ? { lte: new Date(`${sp.ate}T23:59:59`) } : {}) } } : {}),
  };
  const [rows, total, restaurants] = await Promise.all([
    db.order.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { restaurant: { select: { name: true } } } }),
    db.order.count({ where }),
    db.restaurant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader title="Pedidos" description="Todos os pedidos da plataforma." />
      <FilterBar action="/admin/pedidos" q={sp.q} qPlaceholder="Código, cliente, telefone ou e-mail" clearHref="/admin/pedidos">
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={Object.entries(ORDER_STATUS_LABEL)} />
        <FilterSelect name="restaurante" value={sp.restaurante} label="Todos os restaurantes" options={restaurants.map((r) => [r.id, r.name])} />
        <FilterSelect name="pagamento" value={sp.pagamento} label="Todos os pagamentos" options={Object.entries(PAYMENT_METHOD_LABEL).filter(([k]) => k !== "TEST")} />
        <input type="date" name="de" defaultValue={sp.de} aria-label="De" className="h-10 rounded-xl border border-line bg-surface px-2 text-sm" />
        <input type="date" name="ate" defaultValue={sp.ate} aria-label="Até" className="h-10 rounded-xl border border-line bg-surface px-2 text-sm" />
      </FilterBar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/admin/pedidos/${r.id}`}
        empty={<EmptyState icon={Receipt} title="Ainda não existem pedidos" description="Os pedidos aparecem aqui assim que os clientes encomendarem." />}
        columns={[
          { key: "code", header: "Pedido", cell: (r) => <span className="font-mono">#{r.code}</span> },
          { key: "rest", header: "Restaurante", cell: (r) => r.restaurant.name },
          { key: "cust", header: "Cliente", cell: (r) => r.customerName },
          { key: "date", header: "Data", cell: (r) => formatDate(r.createdAt) },
          { key: "total", header: "Total", cell: (r) => <span className="tabular-nums">{formatMoney(r.totalCents, r.currency)}</span> },
          { key: "pay", header: "Pagamento", cell: (r) => <span className="flex flex-col items-end gap-0.5 md:items-start"><span className="text-xs text-muted">{PAYMENT_METHOD_LABEL[r.paymentMethod]}</span><PaymentStatusBadge status={r.paymentStatus} /></span> },
          { key: "status", header: "Estado", cell: (r) => <OrderStatusBadge status={r.status} /> },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/pedidos" params={{ q: sp.q, estado: sp.estado, restaurante: sp.restaurante, cliente: sp.cliente, de: sp.de, ate: sp.ate, pagamento: sp.pagamento }} />
    </>
  );
}
