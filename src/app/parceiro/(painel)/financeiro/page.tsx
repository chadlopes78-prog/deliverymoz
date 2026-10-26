import { Download } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { restaurantOverview, parseRange } from "@/server/services/finance";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button-class";
import { PeriodTabs } from "@/components/period-tabs";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/components/status";

export const metadata = { title: "Financeiro" };

export default async function PartnerFinance({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner("finance.view");
  const range = parseRange(sp);
  const [o, settlements, refunds] = await Promise.all([
    restaurantOverview(ctx.restaurantId, range),
    db.settlement.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.refund.aggregate({ where: { order: { restaurantId: ctx.restaurantId }, status: "COMPLETED", processedAt: { gte: range.from, lte: range.to } }, _sum: { amountCents: true } }),
  ]);
  const m = (v: number) => formatMoney(v, o.currency);
  return (
    <>
      <PageHeader title="Financeiro" description="Valores estimados com base em pedidos reais. Só são considerados recebidos os valores efetivamente liquidados." actions={<a href={`/api/export/orders?escopo=parceiro&periodo=${range.key}`} className={buttonClass("outline", "sm")}><Download className="h-4 w-4" /> Exportar CSV</a>} />
      <PeriodTabs current={range.key} base="/parceiro/financeiro" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Volume de pedidos" value={m(o.grossCents)} hint={`${o.salesCount} pedidos (subtotal)`} />
        <StatCard label="Comissões" value={m(o.commissionCents)} />
        <StatCard label="Descontos" value={m(o.discountCents)} />
        <StatCard label="Reembolsos" value={m(refunds._sum.amountCents ?? 0)} />
        <StatCard label="Líquido estimado (período)" value={m(o.estimatedNetCents)} hint="Inclui pedidos ainda em curso" />
        <StatCard label="Saldo por liquidar" value={m(o.balance.netCents)} hint={`${o.balance.orderCount} pedidos entregues e pagos`} tone="warn" />
        <StatCard label="A receber da plataforma" value={m(o.balance.owedToRestaurant)} />
        <StatCard label="A pagar à plataforma" value={m(o.balance.owedToPlatform)} hint="Comissões de pedidos pagos em numerário ao restaurante" />
      </div>
      <Card className="mt-5">
        <CardHeader title="Liquidações" description={`Total liquidado e pago: ${m(o.settledPaidCents)}`} />
        <CardBody>
          {settlements.length === 0 ? <p className="text-sm text-muted">Ainda não existem liquidações.</p> : (
            <ul className="divide-y divide-line text-sm">
              {settlements.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>{formatDate(s.createdAt, { dateStyle: "medium" })} · {s.orderCount} pedidos</span>
                  <span className="font-semibold tabular-nums">{formatMoney(s.amountCents, s.currency)}</span>
                  <Badge tone={s.status === "PAID" ? "green" : s.status === "PENDING" ? "yellow" : "neutral"}>{{ PENDING: "Pendente", PAID: `Paga${s.reference ? ` · ${s.reference}` : ""}`, CANCELLED: "Anulada" }[s.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
