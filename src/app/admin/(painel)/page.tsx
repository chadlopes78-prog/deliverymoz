import Link from "next/link";
import { Receipt, Clock, CheckCircle2, XCircle, Users, Store, Bike, Wallet, Percent, TrendingUp, Hourglass, AlertTriangle, Download, Plus, Package, ChevronRight } from "lucide-react";
import { platformActivity, platformTotals } from "@/server/services/activity";
import { ActivityList } from "@/components/activity-list";
import { requireAdmin } from "@/server/guards";
import { platformOverview, dailySeries, topRestaurants, paymentMethodBreakdown, parseRange } from "@/server/services/finance";
import { getSettings } from "@/server/services/settings";
import { hasAdminPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BarChart, HBarList } from "@/components/ui/charts";
import { PeriodTabs } from "@/components/period-tabs";
import { buttonClass } from "@/components/ui/button-class";
import { formatMoney } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/components/status";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string; "sem-permissao"?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin("dashboard.view");
  const settings = await getSettings();
  const range = parseRange(sp);
  const canFinance = hasAdminPermission(user, "finance.view");
  const [o, series, top, methods, t, activity] = await Promise.all([platformOverview(range), dailySeries(range), topRestaurants(range), paymentMethodBreakdown(range), platformTotals(), platformActivity({ take: 10 })]);
  const m = (v: number) => formatMoney(v, o.currency);
  return (
    <>
      {sp["sem-permissao"] && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Não tem permissão para aceder a essa área.</p>}
      {!settings.setupCompletedAt && user.isSuperAdmin && (
        <Link href="/admin/configuracoes/inicial" className="mb-5 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-brand" />
          <span><strong>Conclua a configuração inicial</strong> — defina cidades, contactos, taxas e métodos de pagamento.</span>
        </Link>
      )}
      <PageHeader title="Visão geral" description="Indicadores calculados a partir dos dados reais da plataforma." actions={<>{hasAdminPermission(user, "restaurants.manage") && <><Link href="/admin/restaurantes/novo" className={buttonClass("outline", "sm")}><Plus className="h-4 w-4" /> Restaurante</Link><Link href="/admin/produtos/novo" className={buttonClass("outline", "sm")}><Plus className="h-4 w-4" /> Produto</Link></>}{canFinance ? <a href={`/api/export/orders?periodo=${range.key}${sp.de ? `&de=${sp.de}` : ""}${sp.ate ? `&ate=${sp.ate}` : ""}`} className={buttonClass("outline", "sm")}><Download className="h-4 w-4" /> Exportar CSV</a> : null}</>} />
      <section aria-labelledby="plataforma">
        <h2 id="plataforma" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Plataforma (total)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Restaurantes" value={t.restaurants} hint={`${t.restActive} ativos · ${t.restSuspended} suspensos`} icon={Store} tone="brand" />
          <Link href="/admin/aprovacoes" className="block rounded-[var(--radius-card)] focus-visible:outline-2"><StatCard label="Registos pendentes" value={t.restPending} hint="Restaurantes a aguardar aprovação" icon={Hourglass} tone={t.restPending ? "warn" : "neutral"} /></Link>
          <StatCard label="Compradores" value={t.buyers} hint={`${t.users} utilizadores no total`} icon={Users} />
          <StatCard label="Contas de parceiros" value={t.partners} icon={Store} />
          <StatCard label="Produtos publicados" value={t.productsActive} hint="Disponíveis em restaurantes aprovados" icon={Package} />
          <StatCard label="Pedidos recebidos" value={t.ordersTotal} hint={`${t.ordersInProgress} em curso`} icon={Receipt} tone="brand" />
          <StatCard label="Concluídos / cancelados" value={`${t.ordersDone} / ${t.ordersCancelled}`} icon={CheckCircle2} tone="accent" />
          {canFinance && <StatCard label="Volume de pedidos" value={m(t.gmvCents)} hint="Valor total dos pedidos válidos (não é receita recebida)" icon={TrendingUp} />}
        </div>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Atividade recente" action={<Link href="/admin/atividade" className="text-sm font-semibold text-brand">Ver tudo</Link>} />
          <CardBody><ActivityList items={activity} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Atalhos" />
          <CardBody className="grid gap-2 text-sm">
            {[["/admin/aprovacoes", "Rever registos pendentes"], ["/admin/restaurantes", "Gerir restaurantes"], ["/admin/produtos", "Gerir produtos"], ["/admin/pedidos", "Acompanhar pedidos"], ["/admin/compradores", "Gerir compradores"], ["/admin/administradores", "Administradores e permissões"]].map(([href, label]) => (
              <Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 font-semibold hover:border-brand hover:text-brand">{label}<ChevronRight className="h-4 w-4" /></Link>
            ))}
          </CardBody>
        </Card>
      </section>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted">Desempenho por período</h2>
      <PeriodTabs current={range.key} base="/admin" />

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pedidos (período)" value={o.totalOrders} icon={Receipt} tone="brand" />
        <StatCard label="Pedidos hoje" value={o.ordersToday} icon={Clock} />
        <StatCard label="Em andamento" value={o.inProgress} icon={Hourglass} tone="warn" />
        <StatCard label="Concluídos" value={o.delivered} icon={CheckCircle2} tone="accent" />
        <StatCard label="Cancelados/recusados" value={o.cancelled} hint={`Taxa: ${(o.cancelRate * 100).toFixed(1)}%`} icon={XCircle} />
        <StatCard label="Entregadores" value={o.approvedCouriers} hint={`${o.availableCouriers} disponíveis agora`} icon={Bike} />
      </section>

      {canFinance && (
        <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Volume bruto (GMV)" value={m(o.grossCents)} hint="Pedidos válidos no período" icon={TrendingUp} tone="brand" />
          <StatCard label="Ticket médio" value={m(o.avgTicketCents)} icon={Receipt} />
          <StatCard label="Comissões" value={m(o.commissionCents)} hint={`+ ${m(o.serviceFeeCents)} taxas de serviço (entregues e pagos)`} icon={Percent} tone="accent" />
          <StatCard label="A liquidar a restaurantes" value={m(o.unsettledRestaurantNetCents)} hint={o.pendingRefundsCount ? `${o.pendingRefundsCount} reembolsos pendentes (${m(o.pendingRefundsCents)})` : "Pedidos entregues e pagos"} icon={Wallet} tone="warn" />
        </section>
      )}

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Pedidos por dia" /><CardBody><BarChart data={series.map((d) => ({ label: d.day, value: d.orders }))} /></CardBody></Card>
        {canFinance && <Card><CardHeader title="Volume de vendas" /><CardBody><BarChart data={series.map((d) => ({ label: d.day, value: d.grossCents }))} format={m} /></CardBody></Card>}
        {canFinance && <Card><CardHeader title="Evolução das comissões" /><CardBody><BarChart data={series.map((d) => ({ label: d.day, value: d.commissionCents }))} format={m} color="var(--accent)" /></CardBody></Card>}
        <Card><CardHeader title="Cancelamentos por dia" /><CardBody><BarChart data={series.map((d) => ({ label: d.day, value: d.cancelled }))} color="#dc2626" /></CardBody></Card>
        <Card><CardHeader title="Restaurantes com mais pedidos" /><CardBody><HBarList data={top.map((t) => ({ label: t.name, value: t.orders }))} /></CardBody></Card>
        <Card><CardHeader title="Métodos de pagamento" /><CardBody><HBarList data={methods.map((x) => ({ label: PAYMENT_METHOD_LABEL[x.method], value: x.orders }))} /></CardBody></Card>
      </section>
    </>
  );
}
