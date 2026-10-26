import Link from "next/link";
import { Download, Wallet } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { parseRange, restaurantBalance, courierEarnings } from "@/server/services/finance";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/tabs";
import { StatCard } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { PeriodTabs } from "@/components/period-tabs";
import { PaymentStatusBadge, PAYMENT_METHOD_LABEL, formatDate } from "@/components/status";
import { formatMoney } from "@/lib/money";
import { getProvider } from "@/server/payments/registry";
import { processRefundAction, settlementPaidAction, settlementCancelAction, createSettlementAction } from "../actions";

export const metadata = { title: "Financeiro" };

type SP = { tab?: string; periodo?: string; de?: string; ate?: string };

export default async function Finance({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const admin = await requireAdmin("finance.view");
  const manage = hasAdminPermission(admin, "finance.manage");
  const settings = await getSettings();
  const cur = settings.currency;
  const m = (v: number) => formatMoney(v, cur);
  const tab = sp.tab ?? "resumo";
  return (
    <>
      <PageHeader title="Financeiro" description="Valores calculados a partir de pedidos e pagamentos confirmados. Cobranças iniciadas não contam como recebidas." actions={<a href={`/api/export/orders?periodo=${sp.periodo ?? "30d"}`} className={buttonClass("outline", "sm")}><Download className="h-4 w-4" /> Exportar pedidos (CSV)</a>} />
      <Tabs base="/admin/financeiro" current={tab} tabs={[["resumo", "Resumo"], ["reembolsos", "Reembolsos"], ["liquidacoes", "Liquidações"], ["entregadores", "Entregadores"], ["transacoes", "Transações"]]} />
      {tab === "resumo" && <Summary sp={sp} m={m} />}
      {tab === "reembolsos" && <Refunds manage={manage} m={m} />}
      {tab === "liquidacoes" && <Settlements manage={manage} m={m} />}
      {tab === "entregadores" && <Couriers m={m} />}
      {tab === "transacoes" && <Transactions />}
    </>
  );
}

async function Summary({ sp, m }: { sp: SP; m: (v: number) => string }) {
  const range = parseRange(sp);
  const where = { createdAt: { gte: range.from, lte: range.to } };
  const [gross, delivered, refunds, paidOnline] = await Promise.all([
    db.order.aggregate({ where: { ...where, status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT"] } }, _sum: { totalCents: true }, _count: true }),
    db.order.aggregate({
      where: { ...where, status: "DELIVERED", paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
      _sum: { totalCents: true, commissionCents: true, serviceFeeCents: true, deliveryFeeCents: true, courierFeeCents: true, discountCents: true, restaurantNetCents: true },
      _count: true,
    }),
    db.refund.aggregate({ where: { status: "COMPLETED", processedAt: { gte: range.from, lte: range.to } }, _sum: { amountCents: true }, _count: true }),
    db.payment.aggregate({ where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] }, paidAt: { gte: range.from, lte: range.to }, provider: { not: "CASH_ON_DELIVERY" } }, _sum: { amountCents: true }, _count: true }),
  ]);
  const platformDelivery = await db.order.aggregate({ where: { ...where, status: "DELIVERED", deliveryMode: "PLATFORM", paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, _sum: { deliveryFeeCents: true, courierFeeCents: true } });
  const platformDiscounts = await db.order.aggregate({ where: { ...where, status: "DELIVERED", discountFundedBy: "PLATFORM", paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, _sum: { discountCents: true } });
  const d = delivered._sum;
  const deliveryMargin = (platformDelivery._sum.deliveryFeeCents ?? 0) - (platformDelivery._sum.courierFeeCents ?? 0);
  const revenue = (d.commissionCents ?? 0) + (d.serviceFeeCents ?? 0) + deliveryMargin - (platformDiscounts._sum.discountCents ?? 0);
  return (
    <>
      <PeriodTabs current={range.key} base="/admin/financeiro" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Volume bruto (GMV)" value={m(gross._sum.totalCents ?? 0)} hint={`${gross._count} pedidos válidos (inclui em curso)`} />
        <StatCard label="Pagamentos online recebidos" value={m(paidOnline._sum.amountCents ?? 0)} hint={`${paidOnline._count} confirmados pelo fornecedor`} />
        <StatCard label="Entregues e pagos" value={m(d.totalCents ?? 0)} hint={`${delivered._count} pedidos`} />
        <StatCard label="Reembolsos concluídos" value={m(refunds._sum.amountCents ?? 0)} hint={`${refunds._count} reembolsos`} />
      </div>
      <Card className="mt-5">
        <CardHeader title="Receita efetiva da plataforma" description="Apenas pedidos entregues com pagamento confirmado." />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Comissões</dt><dd className="tabular-nums">{m(d.commissionCents ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>Taxas de serviço</dt><dd className="tabular-nums">{m(d.serviceFeeCents ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>Margem de entrega (taxa cobrada − valor do entregador)</dt><dd className="tabular-nums">{m(deliveryMargin)}</dd></div>
            <div className="flex justify-between"><dt>Descontos financiados pela plataforma</dt><dd className="tabular-nums">−{m(platformDiscounts._sum.discountCents ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Receita líquida</dt><dd className="tabular-nums">{m(revenue)}</dd></div>
            <div className="flex justify-between pt-3 text-muted"><dt>Valor líquido dos restaurantes (devido)</dt><dd className="tabular-nums">{m(d.restaurantNetCents ?? 0)}</dd></div>
            <div className="flex justify-between text-muted"><dt>Valor dos entregadores</dt><dd className="tabular-nums">{m(d.courierFeeCents ?? 0)}</dd></div>
          </dl>
        </CardBody>
      </Card>
    </>
  );
}

async function Refunds({ manage, m }: { manage: boolean; m: (v: number) => string }) {
  const rows = await db.refund.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { order: { select: { id: true, code: true } }, payment: { select: { provider: true } } } });
  if (!rows.length) return <EmptyState icon={Wallet} title="Sem reembolsos" description="Os reembolsos de pedidos cancelados, recusados ou de reclamações aparecem aqui." />;
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const provider = r.payment ? getProvider(r.payment.provider) : null;
        const auto = !!provider?.refund && provider.missingConfig().length === 0;
        return (
          <li key={r.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/pedidos/${r.order.id}`} className="font-semibold hover:text-brand">#{r.order.code} · {m(r.amountCents)}</Link>
              <Badge tone={r.status === "COMPLETED" ? "green" : r.status === "PENDING" ? "yellow" : r.status === "FAILED" ? "red" : "neutral"}>{{ PENDING: "Pendente", PROCESSING: "Em processamento", COMPLETED: "Concluído", FAILED: "Falhou", REJECTED: "Recusado" }[r.status]}</Badge>
            </div>
            <p className="text-muted">{r.reason} · {r.payment ? PAYMENT_METHOD_LABEL[r.payment.provider] : "—"} · {formatDate(r.createdAt)}{r.providerRef ? ` · ref. ${r.providerRef}` : ""}</p>
            {r.notes && <p className="text-muted">Notas: {r.notes}</p>}
            {manage && (r.status === "PENDING" || r.status === "FAILED") && (
              <div className="mt-3 flex flex-wrap items-start gap-2">
                {auto && <QuickAction action={processRefundAction} hidden={{ id: r.id, mode: "PROVIDER" }} label="Reembolsar via fornecedor" variant="accent" confirmMessage="Executar o reembolso no fornecedor de pagamento?" />}
                <ActionForm action={processRefundAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="mode" value="MANUAL" />
                  <Input name="reference" required placeholder="Referência da transação" className="h-9 w-52" aria-label="Referência" />
                  <SubmitButton size="sm" variant="outline">Registar reembolso manual</SubmitButton>
                </ActionForm>
                <ActionForm action={processRefundAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="mode" value="REJECT" />
                  <Input name="notes" required placeholder="Motivo da recusa" className="h-9 w-44" aria-label="Motivo" />
                  <SubmitButton size="sm" variant="ghost">Recusar</SubmitButton>
                </ActionForm>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function Settlements({ manage, m }: { manage: boolean; m: (v: number) => string }) {
  const restaurants = await db.restaurant.findMany({ where: { orders: { some: { status: "DELIVERED", settlementId: null } } }, select: { id: true, name: true, payoutDetails: true }, take: 200 });
  const balances = await Promise.all(restaurants.map(async (r) => ({ ...r, ...(await restaurantBalance(r.id)) })));
  const settlements = await db.settlement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { restaurant: { select: { name: true, id: true } } } });
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 text-lg font-bold">Saldos por liquidar</h2>
        <p className="mb-3 text-sm text-muted">Pedidos entregues e pagos ainda não incluídos numa liquidação. Valor negativo: o restaurante recebeu numerário e deve a comissão à plataforma.</p>
        <DataTable rows={balances.filter((b) => b.orderCount > 0)} rowKey={(b) => b.id} empty={<EmptyState icon={Wallet} title="Nada por liquidar" />}
          columns={[
            { key: "n", header: "Restaurante", cell: (b) => <Link className="hover:text-brand" href={`/admin/restaurantes/${b.id}`}>{b.name}</Link> },
            { key: "o", header: "Pedidos", cell: (b) => b.orderCount },
            { key: "r", header: "A pagar ao restaurante", cell: (b) => m(b.owedToRestaurant) },
            { key: "p", header: "Devido à plataforma", cell: (b) => m(b.owedToPlatform) },
            { key: "net", header: "Saldo", cell: (b) => <strong className={b.netCents < 0 ? "text-red-600" : ""}>{m(b.netCents)}</strong> },
            { key: "a", header: "", cell: (b) => manage ? <ActionForm action={createSettlementAction} hideMessage={false}><input type="hidden" name="restaurantId" value={b.id} /><SubmitButton size="sm" variant="outline">Criar liquidação</SubmitButton></ActionForm> : null },
          ]} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-bold">Histórico de liquidações</h2>
        {settlements.length === 0 ? <p className="text-sm text-muted">Ainda não existem liquidações.</p> : (
          <ul className="space-y-2">
            {settlements.map((s) => (
              <li key={s.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><Link href={`/admin/restaurantes/${s.restaurant.id}`} className="font-semibold hover:text-brand">{s.restaurant.name}</Link> · {s.orderCount} pedidos até {formatDate(s.periodEnd, { dateStyle: "short" })}</span>
                  <span className="font-bold tabular-nums">{formatMoney(s.amountCents, s.currency)}</span>
                  <Badge tone={s.status === "PAID" ? "green" : s.status === "PENDING" ? "yellow" : "neutral"}>{{ PENDING: "Pendente", PAID: "Paga", CANCELLED: "Anulada" }[s.status]}</Badge>
                </div>
                {s.reference && <p className="text-muted">Referência: {s.reference} · {formatDate(s.paidAt)}</p>}
                {manage && s.status === "PENDING" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionForm action={settlementPaidAction} className="flex gap-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Input name="reference" required placeholder="Referência da transferência" className="h-9 w-56" aria-label="Referência" />
                      <SubmitButton size="sm" variant="accent">Marcar como paga</SubmitButton>
                    </ActionForm>
                    <QuickAction action={settlementCancelAction} hidden={{ id: s.id }} label="Anular" confirmMessage="Anular esta liquidação? Os pedidos voltam a ficar por liquidar." />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function Couriers({ m }: { m: (v: number) => string }) {
  const couriers = await db.courier.findMany({ where: { deliveries: { some: { status: "DELIVERED" } } }, include: { user: { select: { name: true } } }, take: 200 });
  const rows = await Promise.all(couriers.map(async (c) => ({ id: c.id, name: c.user.name, ...(await courierEarnings(c.id)) })));
  return (
    <DataTable rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/admin/entregadores/${r.id}`} empty={<EmptyState icon={Wallet} title="Sem ganhos de entregadores" />}
      columns={[
        { key: "n", header: "Entregador", cell: (r) => r.name },
        { key: "d", header: "Entregas", cell: (r) => r.deliveredCount },
        { key: "e", header: "Calculado", cell: (r) => m(r.earnedCents) },
        { key: "p", header: "Pago", cell: (r) => m(r.paidCents) },
        { key: "u", header: "Por pagar", cell: (r) => <strong>{m(r.unpaidCents)}</strong> },
        { key: "c", header: "Numerário em posse", cell: (r) => m(r.cashCollectedCents) },
      ]} />
  );
}

async function Transactions() {
  const payments = await db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { id: true, code: true } } } });
  return (
    <DataTable rows={payments} rowKey={(p) => p.id} rowHref={(p) => `/admin/pedidos/${p.order.id}`} empty={<EmptyState icon={Wallet} title="Sem transações" />}
      columns={[
        { key: "r", header: "Referência", cell: (p) => <span className="font-mono text-xs">{p.reference}</span> },
        { key: "o", header: "Pedido", cell: (p) => `#${p.order.code}` },
        { key: "m", header: "Método", cell: (p) => PAYMENT_METHOD_LABEL[p.provider] },
        { key: "v", header: "Valor", cell: (p) => formatMoney(p.amountCents, p.currency) },
        { key: "s", header: "Estado", cell: (p) => <PaymentStatusBadge status={p.status} /> },
        { key: "d", header: "Data", cell: (p) => formatDate(p.createdAt) },
      ]} />
  );
}

