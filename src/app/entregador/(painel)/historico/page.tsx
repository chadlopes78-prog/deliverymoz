import { History } from "lucide-react";
import { requireCourierUser } from "@/server/guards";
import { db } from "@/server/db";
import { courierEarnings } from "@/server/services/finance";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { DELIVERY_STATUS_LABEL, formatDate } from "@/components/status";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Histórico" };

export default async function CourierHistory({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const sp = await searchParams;
  const user = await requireCourierUser();
  const courier = await db.courier.findUniqueOrThrow({ where: { userId: user.id } });
  const settings = await getSettings();
  const { page, pageSize, skip, take } = pageParams(sp);
  const where = { courierId: courier.id, status: { in: ["DELIVERED" as const, "CANCELLED" as const] } };
  const [rows, total, earnings, payouts] = await Promise.all([
    db.delivery.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { order: { select: { code: true, neighborhoodName: true, restaurant: { select: { name: true } } } } } }),
    db.delivery.count({ where }),
    courierEarnings(courier.id),
    db.courierPayout.findMany({ where: { courierId: courier.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const m = (v: number) => formatMoney(v, settings.currency);
  return (
    <>
      <PageHeader title="Histórico e ganhos" description="Valores calculados por entrega. “Pago” corresponde a pagamentos registados pela plataforma." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Concluídas" value={earnings.deliveredCount} />
        <StatCard label="Canceladas" value={earnings.cancelledCount} />
        <StatCard label="Calculado" value={m(earnings.earnedCents)} />
        <StatCard label="Pago" value={m(earnings.paidCents)} hint={`Por receber: ${m(earnings.unpaidCents)}`} />
      </div>
      {rows.length === 0 ? <EmptyState icon={History} title="Ainda não realizou entregas" /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span><span className="font-mono font-semibold">#{d.order.code}</span> · {d.order.restaurant.name} → {d.order.neighborhoodName}<span className="block text-xs text-muted">{formatDate(d.deliveredAt ?? d.cancelledAt ?? d.createdAt, undefined, settings.timezone)}</span></span>
              <span className="flex items-center gap-2"><Badge tone={d.status === "DELIVERED" ? "green" : "red"}>{DELIVERY_STATUS_LABEL[d.status]}</Badge>{d.status === "DELIVERED" && <strong>{m(d.courierFeeCents)}</strong>}{d.courierPayoutId && <Badge tone="blue">Pago</Badge>}</span>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/entregador/historico" params={{}} />
      {payouts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">Pagamentos recebidos</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">{payouts.map((p) => <li key={p.id} className="flex justify-between p-3"><span>{formatDate(p.paidAt ?? p.createdAt, { dateStyle: "medium" })} · {p.reference}</span><strong>{formatMoney(p.amountCents, p.currency)}</strong></li>)}</ul>
        </section>
      )}
    </>
  );
}
