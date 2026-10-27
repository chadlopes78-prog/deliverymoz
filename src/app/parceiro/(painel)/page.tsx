import Link from "next/link";
import { Receipt, Hourglass, ChefHat, CheckCircle2, TrendingUp, Star, Wallet, Clock, AlertTriangle, Package, XCircle } from "lucide-react";
import { restaurantActivity } from "@/server/services/activity";
import { ActivityList } from "@/components/activity-list";
import { RESTAURANT_STATUS_BLOCK_MESSAGE } from "@/server/permissions";
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

export default async function PartnerHome({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string; candidatura?: string; "sem-permissao"?: string; estado?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner();
  const range = parseRange(sp);
  const [r, readiness, settings] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId }, include: { hours: true } }),
    restaurantReadiness(ctx.restaurantId),
    getSettings(),
  ]);
  const canFinance = hasRestaurantPermission(ctx.role, "finance.view");
  const rid = ctx.restaurantId;
  const [o, series, counts, activity] = await Promise.all([
    restaurantOverview(rid, range),
    dailySeries(range, rid),
    Promise.all([
      db.order.count({ where: { restaurantId: rid, status: "PLACED" } }),
      db.order.count({ where: { restaurantId: rid, status: { in: ["ACCEPTED", "PREPARING"] } } }),
      db.order.count({ where: { restaurantId: rid, status: "READY_FOR_PICKUP" } }),
      db.order.count({ where: { restaurantId: rid, status: "DELIVERED", createdAt: { gte: range.from, lte: range.to } } }),
      db.order.count({ where: { restaurantId: rid, status: { in: ["CANCELLED", "REJECTED"] }, createdAt: { gte: range.from, lte: range.to } } }),
      db.product.count({ where: { restaurantId: rid, status: "ACTIVE" } }),
      db.product.count({ where: { restaurantId: rid, status: "PAUSED" } }),
    ]),
    restaurantActivity(rid, 10),
  ]);
  const [cNew, cPrep, cReady, cDone, cCancel, pActive, pPaused] = counts;
  const m = (v: number) => formatMoney(v, o.currency);
  const availability = restaurantAvailability(r, settings.timezone);
  return (
    <>
      {sp.candidatura && <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Candidatura enviada! A equipa vai analisar os seus dados. Entretanto, pode preparar o cardápio, horários e zonas de entrega.</p>}
      {sp["sem-permissao"] && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A sua função não tem acesso a essa área.</p>}
      {sp.estado && r.status !== "APPROVED" && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{RESTAURANT_STATUS_BLOCK_MESSAGE[r.status]}</p>}
      <PageHeader title={r.name} description={availability.orderable ? "A loja está aberta e a aceitar pedidos." : `Loja: ${availability.label.toLowerCase()}.`} actions={
        <div className="flex flex-wrap items-center gap-2">
          <RestaurantStatusBadge status={r.status} />
          {r.status === "APPROVED" && hasRestaurantPermission(ctx.role, "orders.manage") && <QuickAction action={pauseStoreAction} hidden={{ accepting: r.acceptingOrders ? "false" : "true" }} label={r.acceptingOrders ? "Pausar loja" : "Retomar pedidos"} variant={r.acceptingOrders ? "outline" : "accent"} confirmMessage={r.acceptingOrders ? "Pausar a receção de novos pedidos?" : undefined} />}
        </div>
      } />
      {r.status === "PENDING" && (
        <div className="mb-5 flex gap-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Hourglass className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div><p className="font-semibold">Registo em análise</p><p>A equipa do DeliveryMoz está a verificar os dados do restaurante. Enquanto aguarda, pode preparar o cardápio, a loja, os horários e as zonas de entrega. Pedidos, promoções, equipa e financeiro ficam disponíveis depois da aprovação.</p></div>
        </div>
      )}
      {(r.status === "REJECTED" || r.status === "SUSPENDED") && (
        <div className="mb-5 flex gap-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div><p className="font-semibold">{r.status === "REJECTED" ? "Registo não aprovado" : "Restaurante suspenso"}</p><p>{r.statusReason ? `Motivo: ${r.statusReason}. ` : ""}{r.status === "SUSPENDED" ? "O restaurante não aparece aos clientes. Pode concluir os pedidos em curso." : "O restaurante não pode operar na plataforma."} Para esclarecimentos, contacte o suporte.</p></div>
        </div>
      )}
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
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Agora</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/parceiro/pedidos" className="block rounded-[var(--radius-card)]"><StatCard label="Pedidos novos" value={cNew} hint="A aguardar aceitação" icon={Hourglass} tone={cNew ? "warn" : "neutral"} /></Link>
        <StatCard label="Em preparação" value={cPrep} icon={ChefHat} tone="brand" />
        <StatCard label="Prontos" value={cReady} hint="A aguardar recolha" icon={CheckCircle2} tone="accent" />
        <Link href="/parceiro/cardapio" className="block rounded-[var(--radius-card)]"><StatCard label="Produtos" value={`${pActive} / ${pActive + pPaused}`} hint={`${pActive} disponíveis · ${pPaused} indisponíveis`} icon={Package} /></Link>
      </section>
      <div className="mt-6"><PeriodTabs current={range.key} base="/parceiro" /></div>
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Concluídos (período)" value={cDone} icon={CheckCircle2} tone="accent" />
        <StatCard label="Cancelados (período)" value={cCancel} icon={XCircle} />
        {canFinance && <StatCard label="Vendas registadas" value={m(o.grossCents)} hint={`${o.salesCount} pedidos no período`} icon={TrendingUp} tone="brand" />}
        {canFinance && <StatCard label="Ticket médio" value={m(o.avgTicketCents)} icon={Receipt} />}
        <StatCard label="Avaliação" value={o.rating.ratingCount ? o.rating.ratingAvg.toFixed(1) : "—"} hint={`${o.rating.ratingCount} avaliações`} icon={Star} />
        {canFinance && <StatCard label="Estimado a receber" value={m(o.balance.netCents)} hint="Pedidos entregues e pagos ainda não liquidados" icon={Wallet} tone="warn" />}
      </section>
      <Card className="mt-5">
        <CardHeader title="Atividade recente" />
        <CardBody><ActivityList items={activity} empty="Ainda não existe atividade. Os pedidos e alterações ao cardápio aparecem aqui." /></CardBody>
      </Card>
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Pedidos por dia" /><CardBody><BarChart data={series.map((d) => ({ label: d.day, value: d.orders }))} /></CardBody></Card>
        <Card><CardHeader title="Produtos mais vendidos" /><CardBody><HBarList data={o.topProducts.map((p) => ({ label: p.name, value: p.quantity }))} /></CardBody></Card>
      </section>
      {r.hours.length === 0 && <p className="mt-5 flex items-center gap-2 text-sm text-muted"><Clock className="h-4 w-4" /> Sem horário definido — os clientes verão o restaurante como fechado.</p>}
    </>
  );
}
