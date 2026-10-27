import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Star } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { resolveCommission } from "@/server/services/commission";
import { restaurantOverview, restaurantBalance, parseRange } from "@/server/services/finance";
import { restaurantReadiness } from "@/server/services/restaurants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { RestaurantOperationalBadge } from "@/components/admin/restaurant-status";
import { RestaurantStatusActions } from "@/components/admin/restaurant-actions";
import { buttonClass } from "@/components/ui/button-class";
import { OrderStatusBadge, formatDate, DELIVERY_MODE_LABEL } from "@/components/status";
import { RESTAURANT_ROLE_LABEL } from "@/server/permissions";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/utils";
import { fileUrl } from "@/server/storage/files";
import { restaurantCommercialAction, commissionAction, reviewModerationAction, createSettlementAction, assignOwnerAction } from "@/app/admin/actions";

export default async function AdminRestaurantDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireAdmin("restaurants.view");
  const r = await db.restaurant.findUnique({
    where: { id },
    include: {
      city: true, neighborhood: true, cuisines: true, documents: true,
      members: { include: { user: { select: { name: true, email: true, phone: true } } } },
      menuCategories: { orderBy: { position: "asc" } },
      products: { orderBy: [{ status: "asc" }, { name: "asc" }], take: 200 },
      orders: { orderBy: { createdAt: "desc" }, take: 10 },
      reviews: { orderBy: { createdAt: "desc" }, take: 20, include: { customer: { select: { name: true } } } },
      commissionRules: { orderBy: { effectiveFrom: "desc" }, take: 10 },
      settlements: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!r) notFound();
  const manage = hasAdminPermission(user, "restaurants.manage");
  const canFinance = hasAdminPermission(user, "finance.view");
  const [commission, overview, balance, readiness] = await Promise.all([
    resolveCommission(r.id),
    canFinance ? restaurantOverview(r.id, parseRange({ periodo: "30d" })) : null,
    canFinance ? restaurantBalance(r.id) : null,
    restaurantReadiness(r.id),
  ]);
  const cur = overview?.currency ?? "MZN";
  return (
    <>
      <Link href="/admin/restaurantes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Restaurantes</Link>
      {sp.criado && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Restaurante criado. Para o publicar, defina o horário e as zonas de entrega em <Link href={`/admin/restaurantes/${r.id}/editar`} className="font-semibold underline">Editar</Link> e adicione produtos em <Link href={`/admin/produtos/novo?restaurante=${r.id}`} className="font-semibold underline">Produtos</Link>.</p>}
      <PageHeader title={r.name} description={`${r.city.name} · registado em ${formatDate(r.createdAt, { dateStyle: "medium" })}`} actions={<><RestaurantOperationalBadge status={r.status} acceptingOrders={r.acceptingOrders} isListed={r.isListed} />{manage && <Link href={`/admin/restaurantes/${r.id}/editar`} className={buttonClass("primary", "sm")}>Editar restaurante</Link>}</>} />

      {manage && <div className="mb-5"><RestaurantStatusActions r={r} /></div>}
      {r.statusReason && <p className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">Motivo registado: {r.statusReason}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Informações" />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-muted">Responsável:</span> {r.responsibleName}</p>
            <p><span className="text-muted">Telefone:</span> {formatPhone(r.phone)}</p>
            <p><span className="text-muted">E-mail:</span> {r.email ?? "—"}</p>
            <p><span className="text-muted">Endereço:</span> {r.addressLine}{r.neighborhood ? `, ${r.neighborhood.name}` : ""}, {r.city.name}{r.addressReference ? ` (${r.addressReference})` : ""}</p>
            <p><span className="text-muted">Denominação social:</span> {r.legalName ?? "—"} · <span className="text-muted">NUIT:</span> {r.nuit ?? "—"}</p>
            <p><span className="text-muted">Modelo de entrega:</span> {DELIVERY_MODE_LABEL[r.deliveryMode]} · <span className="text-muted">Pagamento na entrega:</span> {r.acceptsCashOnDelivery ? "sim" : "não"}</p>
            <p><span className="text-muted">Loja:</span> {r.acceptingOrders ? "a aceitar pedidos" : "pausada"} · <span className="text-muted">Avaliação:</span> {r.ratingCount ? `${r.ratingAvg.toFixed(1)} (${r.ratingCount})` : "sem avaliações"}</p>
            {r.businessInfo && <p className="whitespace-pre-line rounded-lg bg-ink/5 p-2"><span className="text-muted">Informações comerciais:</span> {r.businessInfo}</p>}
            {canFinance && <p className="whitespace-pre-line"><span className="text-muted">Dados de liquidação:</span> {r.payoutDetails ?? "não indicados"}</p>}
            {r.documents.length > 0 && (
              <div className="pt-2"><p className="font-semibold">Documentos</p>
                <ul className="mt-1 space-y-1">{r.documents.map((d) => <li key={d.id}><a href={fileUrl(d.fileId)!} target="_blank" className="inline-flex items-center gap-1 text-brand underline"><FileText className="h-4 w-4" /> {d.type}</a></li>)}</ul>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Prontidão para operar" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {readiness.items.map((i) => <li key={i.key} className="flex items-center justify-between"><span>{i.label}</span><Badge tone={i.done ? "green" : "yellow"}>{i.done ? "OK" : "Em falta"}</Badge></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">{readiness.ready ? "O restaurante aparece publicamente." : "O restaurante só aparece publicamente quando todos os itens obrigatórios estiverem completos."}</p>
            {manage && (
              <ActionForm action={restaurantCommercialAction} className="mt-5 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={r.id} />
                <p className="text-sm font-semibold">Modelos de entrega permitidos</p>
                <Checkbox name="allowRestaurantDelivery" defaultChecked={r.allowRestaurantDelivery} label="Entrega pelo próprio restaurante" />
                <Checkbox name="allowPlatformDelivery" defaultChecked={r.allowPlatformDelivery} label="Entrega organizada pela plataforma (entregadores)" />
                <Checkbox name="isFeatured" defaultChecked={r.isFeatured} label="Restaurante em destaque na página inicial" />
                <SubmitButton size="sm">Guardar</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Comissão" description={`Aplicável agora: ${(commission.bps / 100).toFixed(2)}%${commission.fixedCents ? ` + ${formatMoney(commission.fixedCents, cur)}` : ""} (${{ RESTAURANT: "regra específica", GLOBAL: "regra global", DEFAULT: "valor por omissão" }[commission.source]})`} />
          <CardBody>
            {r.commissionRules.length > 0 && (
              <ul className="mb-4 space-y-1 text-sm">{r.commissionRules.map((c) => <li key={c.id} className="flex justify-between"><span>{(c.percentageBps / 100).toFixed(2)}%{c.fixedCents ? ` + ${formatMoney(c.fixedCents, cur)}` : ""}</span><span className="text-muted">desde {formatDate(c.effectiveFrom)}</span></li>)}</ul>
            )}
            {hasAdminPermission(user, "commissions.manage") && (
              <ActionForm action={commissionAction} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="restaurantId" value={r.id} />
                <Field label="Percentagem (%)" htmlFor="pct"><Input id="pct" name="percentage" inputMode="decimal" required placeholder="12" /></Field>
                <Field label={`Fixo (${cur})`} htmlFor="fixed"><Input id="fixed" name="fixed" inputMode="decimal" placeholder="0" /></Field>
                <Field label="Início" htmlFor="eff"><Input id="eff" name="effectiveFrom" type="datetime-local" /></Field>
                <div className="sm:col-span-3"><SubmitButton size="sm">Definir comissão específica</SubmitButton></div>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Equipa do restaurante" />
          <CardBody>
            {r.members.length === 0 ? <p className="text-sm text-muted">Nenhuma conta associada.</p> : (
              <ul className="space-y-1 text-sm">{r.members.map((m) => <li key={m.id} className="flex justify-between gap-2"><span>{m.user.name} <span className="text-muted">({m.user.email})</span></span><Badge>{RESTAURANT_ROLE_LABEL[m.role]}</Badge></li>)}</ul>
            )}
            {manage && (
              <ActionForm action={assignOwnerAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={r.id} />
                <Input name="email" type="email" placeholder="E-mail de uma conta existente" required aria-label="E-mail do proprietário" />
                <SubmitButton size="md" variant="outline">Associar proprietário</SubmitButton>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      </div>

      {overview && balance && (
        <section className="mt-5">
          <h2 className="mb-3 text-lg font-bold">Financeiro (últimos 30 dias)</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Vendas (subtotal)" value={formatMoney(overview.grossCents, cur)} hint={`${overview.salesCount} pedidos`} />
            <StatCard label="Comissões" value={formatMoney(overview.commissionCents, cur)} />
            <StatCard label="Saldo por liquidar" value={formatMoney(balance.netCents, cur)} hint={`${balance.orderCount} pedidos entregues e pagos`} />
            <StatCard label="Liquidações pagas" value={formatMoney(overview.settledPaidCents, cur)} />
          </div>
          {hasAdminPermission(user, "finance.manage") && balance.orderCount > 0 && (
            <ActionForm action={createSettlementAction} className="mt-3 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
              <input type="hidden" name="restaurantId" value={r.id} />
              <Field label="Liquidar pedidos entregues até" htmlFor="periodEnd"><Input id="periodEnd" name="periodEnd" type="date" /></Field>
              <Field label="Notas" htmlFor="snotes" className="flex-1"><Input id="snotes" name="notes" /></Field>
              <SubmitButton>Criar liquidação</SubmitButton>
            </ActionForm>
          )}
          {r.settlements.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
              {r.settlements.map((s) => <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span>{formatDate(s.createdAt, { dateStyle: "short" })} · {s.orderCount} pedidos</span><span className="font-semibold">{formatMoney(s.amountCents, s.currency)}</span><Badge tone={s.status === "PAID" ? "green" : s.status === "PENDING" ? "yellow" : "neutral"}>{{ PENDING: "Pendente", PAID: "Paga", CANCELLED: "Anulada" }[s.status]}</Badge></li>)}
            </ul>
          )}
        </section>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cardápio" description={`${r.menuCategories.length} categorias · ${r.products.filter((p) => p.status === "ACTIVE").length} produtos ativos`} action={<Link href={`/admin/produtos?restaurante=${r.id}`} className="text-sm font-semibold text-brand">Gerir produtos</Link>} />
          <CardBody>
            {r.products.length === 0 ? <p className="text-sm text-muted">Este restaurante ainda não adicionou produtos ao seu cardápio.</p> : (
              <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
                {r.products.map((p) => <li key={p.id} className="flex justify-between gap-2"><Link href={`/admin/produtos/${p.id}`} className="hover:text-brand"><span className={p.status !== "ACTIVE" ? "text-muted line-through" : ""}>{p.name}</span></Link><span className="tabular-nums">{formatMoney(p.priceCents, cur)}</span></li>)}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pedidos recentes" action={<Link href={`/admin/pedidos?restaurante=${r.id}`} className="text-sm font-semibold text-brand">Ver todos</Link>} />
          <CardBody>
            {r.orders.length === 0 ? <p className="text-sm text-muted">Ainda não existem pedidos.</p> : (
              <ul className="space-y-2 text-sm">{r.orders.map((o) => <li key={o.id}><Link href={`/admin/pedidos/${o.id}`} className="flex items-center justify-between gap-2 hover:text-brand"><span className="font-mono">#{o.code}</span><span className="text-muted">{formatDate(o.createdAt)}</span><OrderStatusBadge status={o.status} /></Link></li>)}</ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Avaliações" />
        <CardBody>
          {r.reviews.length === 0 ? <p className="text-sm text-muted">Sem avaliações.</p> : (
            <ul className="divide-y divide-line">
              {r.reviews.map((rv) => (
                <li key={rv.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="flex items-center gap-1 font-semibold">{rv.customer.name} · <Star className="h-4 w-4 fill-amber-400 text-amber-400" />{rv.rating}{rv.status === "HIDDEN" && <Badge tone="red">Oculta</Badge>}</p>
                    {rv.comment && <p className="text-muted">{rv.comment}</p>}
                  </div>
                  {manage && <QuickAction action={reviewModerationAction} hidden={{ id: rv.id, status: rv.status === "HIDDEN" ? "PUBLISHED" : "HIDDEN" }} label={rv.status === "HIDDEN" ? "Publicar" : "Ocultar"} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
