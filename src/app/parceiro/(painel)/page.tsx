import Link from "next/link";
import { Receipt, Hourglass, ChefHat, CheckCircle2, TrendingUp, Star, Wallet, Clock, AlertTriangle } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { restaurantOverview, parseRange, dailySeries } from "@/server/services/finance";
import { restaurantReadiness } from "@/server/services/restaurants";
import { hasRestaurantPermission } from "@/server/permissions";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { restaurantAvailability } from "@/server/services/availability";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BarChart, HBarList } from "@/components/ui/charts";
import { Badge } from "@/components/ui/badge";
import { PeriodTabs } from "@/components/period-tabs";
import { QuickAction } from "@/components/reason-form";
import { RestaurantStatusBadge } from "@/components/admin/restaurant-status";
import { formatMoney } from "@/lib/money";
import { pauseStoreAction } from "../actions";

export default async function PartnerHome({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string; candidatura?: string; "sem-permissao"?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner();
  const range = parseRange(sp);
  const [r, readiness, settings] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId }, include: { hours: true } }),
    restaurantReadiness(ctx.restaurantId),
    getSettings(),
  ]);
  const canFinance = hasRestaurantPermission(ctx.role, "finance.view");
  const [o, series] = await Promise.all([restaurantOverview(ctx.restaurantId, range), dailySeries(range, ctx.restaurantId)]);
  const m = (v: number) => formatMoney(v, o.currency);
  const availability = restaurantAvailability(r, settings.timezone);
  return (
    <>
      {sp.candidatura && <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Candidatura enviada! A equipa vai analisar os seus dados. Entretanto, pode preparar o cardápio, horários e zonas de entrega.</p>}
      {sp["sem-permissao"] && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A sua função não tem acesso a essa área.</p>}
      <PageHeader title={r.name} description={availability.orderable ? "A loja está aberta e a aceitar pedidos." : `Loja: ${availability.label.toLowerCase()}.`} actions={
        <div className="flex flex-wrap items-center gap-2">
          <RestaurantStatusBadge status={r.status} />
          {r.status === "APPROVED" && hasRestaurantPermission(ctx.role, "orders.manage") && <QuickAction action={pauseStoreAction} hidden={{ accepting: r.acceptingOrders ? "false" : "true" }} label={r.acceptingOrders ? "Pausar loja" : "Retomar pedidos"} variant={r.acceptingOrders ? "outline" : "accent"} confirmMessage={r.acceptingOrders ? "Pausar a receção de novos pedidos?" : undefined} />}
        </div>
      } />
      {r.status === "PENDING" && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A sua candidatura aguarda aprovação. Só poderá receber pedidos depois de aprovada.</p>}
      {(r.status === "REJECTED" || r.status === "SUSPENDED") && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Restaurante {r.status === "REJECTED" ? "não aprovado" : "suspenso"}. {r.statusReason}</p>}
      {!readiness.ready && (
        <Card className="mb-5 border-brand/30">
          <CardHeader title="Complete a configuração da loja" description="O restaurante só aparece aos clientes quando todos os itens obrigatórios estiverem completos." />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {readiness.items.map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">{i.done ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{i.label}</span>
                  {!i.done && i.href ? <Link href={i.href} className="font-semibold text-brand">Configurar</Link> : <Badge tone={i.done ? "green" : "yellow"}>{i.done ? "OK" : "Pendente"}</Badge>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
      <PeriodTabs current={range.key} base="/parceiro" />
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pedidos hoje" value={o.today} icon={Receipt} tone="brand" />
        <StatCard label="Por aceitar" value={o.pending} icon={Hourglass} tone={o.pending ? "warn" : "neutral"} />
        <StatCard label="Em preparação" value={o.preparing} icon={ChefHat} />
        <StatCard label="Concluídos (período)" value={o.completed} icon={CheckCircle2} tone="accent" />
        {canFinance && <StatCard label="Vendas (período)" value={m(o.grossCents)} hint={`${o.salesCount} pedidos`} icon={TrendingUp} />}
        {canFinance && <StatCard label="Ticket médio" value={m(o.avgTicketCents)} icon={Receipt} />}
        <StatCard label="Avaliação" value={o.rating.ratingCount ? o.rating.ratingAvg.toFixed(1) : "—"} hint={`${o.rating.ratingCount} avaliações`} icon={Star} />
        {canFinance && <StatCard label="Estimado a receber" value={m(o.balance.netCents)} hint="Pedidos entregues e pagos ainda não liquidados" icon={Wallet} tone="warn" />}
      </section>
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Pedidos por dia" /><CardBody><BarChart data={series.map((d) => ({ label: d.day, value: d.orders }))} /></CardBody></Card>
        <Card><CardHeader title="Produtos mais vendidos" /><CardBody><HBarList data={o.topProducts.map((p) => ({ label: p.name, value: p.quantity }))} /></CardBody></Card>
      </section>
      {r.hours.length === 0 && <p className="mt-5 flex items-center gap-2 text-sm text-muted"><Clock className="h-4 w-4" /> Sem horário definido — os clientes verão o restaurante como fechado.</p>}
    </>
  );
}
