import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireUser } from "@/server/guards";
import { db } from "@/server/db";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button-class";
import { OrderStatusBadge, formatDate } from "@/components/status";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { formatMoney } from "@/lib/money";
import { Thumb } from "@/components/public/restaurant-card";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/minha-conta/pedidos");
  const { page, pageSize, skip, take } = pageParams(sp, 15);
  const [orders, total] = await Promise.all([
    db.order.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, skip, take, include: { restaurant: { select: { name: true, logoFileId: true } }, _count: { select: { items: true } } } }),
    db.order.count({ where: { customerId: user.id } }),
  ]);
  if (!total) return <EmptyState icon={Receipt} title="Ainda não fez nenhum pedido" description="Os seus pedidos aparecerão aqui." action={<Link href="/restaurantes" className={buttonClass()}>Explorar restaurantes</Link>} />;
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">Os meus pedidos</h2>
      <ul className="space-y-2.5">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/acompanhar/${o.code}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/40">
              <Thumb id={o.restaurant.logoFileId} name={o.restaurant.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{o.restaurant.name}</p>
                <p className="text-xs text-muted">#{o.code} · {formatDate(o.createdAt)} · {o._count.items} {o._count.items === 1 ? "item" : "itens"}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <OrderStatusBadge status={o.status} />
                <span className="text-sm font-semibold tabular-nums">{formatMoney(o.totalCents, o.currency)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/minha-conta/pedidos" params={{}} />
    </div>
  );
}
