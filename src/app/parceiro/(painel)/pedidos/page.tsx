import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { Receipt, Phone, MapPin, Bike } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { ReasonForm, QuickAction } from "@/components/reason-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { NewOrderAlert } from "@/components/partner/new-order-alert";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { OrderStatusBadge, PaymentStatusBadge, PAYMENT_METHOD_LABEL, DELIVERY_STATUS_LABEL, formatDate } from "@/components/status";
import { ORDER_STATUS_LABEL } from "@/server/services/order-state";
import { formatMoney } from "@/lib/money";
import { formatPhone, cn } from "@/lib/utils";
import { zonedToUtc } from "@/lib/hours";
import { orderTransitionAction } from "../../actions";

export const metadata = { title: "Pedidos" };

const ACTIVE: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT"];

const TABS = [
  { key: "novos", label: "Novos", statuses: ["PLACED"] as OrderStatus[] },
  { key: "preparacao", label: "Em preparação", statuses: ["ACCEPTED", "PREPARING"] as OrderStatus[] },
  { key: "prontos", label: "Prontos", statuses: ["READY_FOR_PICKUP"] as OrderStatus[] },
  { key: "entrega", label: "Em entrega", statuses: ["PICKED_UP", "IN_TRANSIT"] as OrderStatus[] },
];

type ActiveOrder = Prisma.OrderGetPayload<{ include: { items: true; delivery: { include: { courier: { include: { user: { select: { name: true; phone: true } } } } } } } }>;

export default async function PartnerOrders({ searchParams }: { searchParams: Promise<{ tab?: string; pedido?: string; q?: string; estado?: string; pagina?: string; de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner("orders.manage");
  const settings = await getSettings();
  if (sp.tab === "historico") return <History ctx={ctx} sp={sp} tz={settings.timezone} />;

  const orders: ActiveOrder[] = await db.order.findMany({
    where: { restaurantId: ctx.restaurantId, status: { in: ACTIVE } },
    orderBy: { createdAt: "asc" },
    include: { items: true, delivery: { include: { courier: { include: { user: { select: { name: true, phone: true } } } } } } },
  });
  // O pedido selecionado define o separador (continua visível quando muda de estado)
  const selected = orders.find((o) => o.id === sp.pedido) ?? null;
  const tab = TABS.find((t) => (selected ? t.statuses.includes(selected.status) : t.key === sp.tab)) ?? TABS.find((t) => orders.some((o) => t.statuses.includes(o.status))) ?? TABS[0];
  const q = sp.q?.trim().replace("#", "").toUpperCase();
  const list = orders.filter((o) => tab.statuses.includes(o.status) && (!q || o.code.includes(q) || o.customerName.toUpperCase().includes(q)));
  const current = selected ?? list[0] ?? null;
  const tabHref = (key: string) => `/parceiro/pedidos?tab=${key}`;
  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Pedidos" description="Atualização automática a cada 10 segundos." actions={<NewOrderAlert placedIds={orders.filter((o) => o.status === "PLACED").map((o) => o.id)} />} />
      <nav className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Estados dos pedidos">
        {TABS.map((t) => {
          const n = orders.filter((o) => t.statuses.includes(o.status)).length;
          const active = t.key === tab.key;
          return (
            <Link key={t.key} href={tabHref(t.key)} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold", active ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent")}>
              {t.label}<span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs", active ? "bg-white/25" : t.key === "novos" && n ? "bg-brand text-brand-contrast" : "bg-ink/10")}>{n}</span>
            </Link>
          );
        })}
        <Link href={tabHref("historico")} className="flex min-h-10 shrink-0 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold hover:border-accent">Histórico</Link>
      </nav>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr] [&>*]:min-w-0">
        <section aria-label={`Pedidos: ${tab.label}`} className={cn("rounded-[var(--radius-card)] border border-line bg-surface", sp.pedido && current && "hidden lg:block")}>
          <form action="/parceiro/pedidos" className="border-b border-line p-3" role="search">
            <input type="hidden" name="tab" value={tab.key} />
            <input name="q" defaultValue={sp.q ?? ""} type="search" placeholder="Código ou cliente" aria-label="Pesquisar pedidos" className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm" />
          </form>
          {list.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">{q ? "Nenhum pedido encontrado." : `Sem pedidos ${tab.label.toLowerCase()}.`}</p>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((o) => (
                <li key={o.id}>
                  <Link href={`/parceiro/pedidos?tab=${tab.key}&pedido=${o.id}`} aria-current={current?.id === o.id ? "true" : undefined} className={cn("flex items-start justify-between gap-3 p-3 hover:bg-ink/[0.03]", current?.id === o.id && "bg-accent/5 shadow-[inset_3px_0_0] shadow-accent")}>
                    <span className="min-w-0">
                      <span className="block font-mono font-bold">#{o.code}</span>
                      <span className="block truncate text-xs text-muted">{o.customerName} · {o.items.reduce((n, i) => n + i.quantity, 0)} itens · {formatMoney(o.totalCents, o.currency)}</span>
                      <span className="block text-xs text-muted">{o.deliveryMode === "RESTAURANT" ? "Entrega própria" : "Entregador da plataforma"} · {o.neighborhoodName}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted">{formatDate(o.createdAt, { timeStyle: "short" }, settings.timezone)}{o.status === "PLACED" && <Badge tone="brand" className="mt-1 block">Novo</Badge>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Detalhe do pedido" className={cn(!sp.pedido && "hidden lg:block")}>
          {current ? (
            <>
              {sp.pedido && <Link href={tabHref(tab.key)} className="mb-3 inline-block text-sm font-semibold text-accent lg:hidden">← Voltar à lista</Link>}
              <OrderDetail o={current} tz={settings.timezone} />
            </>
          ) : (
            <EmptyState icon={Receipt} title="Sem pedidos em curso" description="Os novos pedidos aparecem aqui automaticamente, com alerta sonoro." />
          )}
        </section>
      </div>
    </>
  );
}

/** Detalhe e ações de um pedido (as transições são validadas no servidor). */
function OrderDetail({ o, tz }: { o: ActiveOrder; tz: string }) {
  return (
    <article className={cn("rounded-[var(--radius-card)] border bg-surface text-sm", o.status === "PLACED" ? "border-brand shadow-[0_0_0_3px] shadow-brand/15" : "border-line")}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-4">
        <div>
          <p className="font-mono text-lg font-bold">#{o.code}</p>
          <p className="text-xs text-muted">{formatDate(o.createdAt, undefined, tz)} · {o.customerName}</p>
        </div>
        <OrderStatusBadge status={o.status} />
      </header>
      <ul className="divide-y divide-line px-4">
        {o.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-3 py-2.5">
            <span><span className="font-semibold">{it.quantity}×</span> {it.productName}
              {Array.isArray(it.options) && (it.options as { name: string }[]).length > 0 && <span className="block pl-5 text-xs text-muted">{(it.options as { name: string }[]).map((x) => x.name).join(", ")}</span>}
              {it.notes && <span className="block pl-5 text-xs font-semibold text-amber-700">“{it.notes}”</span>}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(it.totalCents, o.currency)}</span>
          </li>
        ))}
      </ul>
      {o.notesForRestaurant && <p className="mx-4 mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Nota do cliente: {o.notesForRestaurant}</p>}
      <dl className="grid grid-cols-2 gap-3 border-y border-line bg-ink/[0.02] p-4 text-xs sm:grid-cols-4">
        <div><dt className="text-muted">Pagamento</dt><dd className="mt-0.5 flex flex-wrap items-center gap-1 font-semibold">{PAYMENT_METHOD_LABEL[o.paymentMethod]} <PaymentStatusBadge status={o.paymentStatus} /></dd></div>
        <div><dt className="text-muted">Entrega</dt><dd className="mt-0.5 font-semibold">{o.deliveryMode === "PLATFORM" && o.delivery ? `${DELIVERY_STATUS_LABEL[o.delivery.status]}${o.delivery.courier ? `: ${o.delivery.courier.user.name}` : ""}` : "Pelo restaurante"}</dd></div>
        <div><dt className="text-muted">Pronto previsto</dt><dd className="mt-0.5 font-semibold">{o.estimatedReadyAt ? formatDate(o.estimatedReadyAt, { timeStyle: "short" }, tz) : "—"}</dd></div>
        <div><dt className="text-muted">Total</dt><dd className="mt-0.5 text-base font-bold">{formatMoney(o.totalCents, o.currency)}</dd></div>
      </dl>
      {o.deliveryMode === "RESTAURANT" && o.status !== "PLACED" && (
        <div className="space-y-1 px-4 pt-3 text-xs">
          <p className="flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{o.street}, {o.neighborhoodName}{o.addressReference ? ` — ${o.addressReference}` : ""}</p>
          <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /><a href={`tel:+${o.customerPhone}`} className="text-brand">{formatPhone(o.customerPhone)}</a></p>
          {o.notesForDelivery && <p className="text-muted">Entrega: {o.notesForDelivery}</p>}
        </div>
      )}
      {o.deliveryMode === "PLATFORM" && o.delivery?.courier && <p className="flex items-center gap-1 px-4 pt-3 text-xs"><Bike className="h-3.5 w-3.5" /> Entregador: {o.delivery.courier.user.name}</p>}
      <div className="flex flex-wrap gap-2 p-4">
        {o.status === "PLACED" && (
          <>
            <ActionForm action={orderTransitionAction} className="flex gap-2">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value="ACCEPTED" />
              <Select name="prepTimeMinutes" defaultValue="30" className="h-10 w-24" aria-label="Tempo de preparação">{[10, 15, 20, 30, 40, 50, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
              <SubmitButton variant="accent">Aceitar</SubmitButton>
            </ActionForm>
            <ReasonForm action={orderTransitionAction} hidden={{ id: o.id, to: "REJECTED" }} label="Recusar" variant="danger" placeholder="Motivo (ex.: produto esgotado)" />
          </>
        )}
        {o.status === "ACCEPTED" && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "PREPARING" }} label="Iniciar preparação" size="md" />}
        {(o.status === "ACCEPTED" || o.status === "PREPARING") && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "READY_FOR_PICKUP" }} label="Marcar pronto" variant="accent" size="md" />}
        {o.deliveryMode === "RESTAURANT" && o.status === "READY_FOR_PICKUP" && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "PICKED_UP" }} label="Saiu para entrega" variant="accent" size="md" />}
        {o.deliveryMode === "RESTAURANT" && o.status === "PICKED_UP" && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "IN_TRANSIT" }} label="A caminho" size="md" />}
        {o.deliveryMode === "RESTAURANT" && (o.status === "PICKED_UP" || o.status === "IN_TRANSIT") && (
          <ActionForm action={orderTransitionAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value="DELIVERED" />
            {o.paymentMethod === "CASH_ON_DELIVERY" && <Checkbox name="cashCollected" required label={`Recebi ${formatMoney(o.totalCents, o.currency)}`} />}
            <SubmitButton variant="accent">Entregue</SubmitButton>
          </ActionForm>
        )}
        {o.deliveryMode === "PLATFORM" && o.status === "READY_FOR_PICKUP" && <p className="text-xs text-muted">A aguardar recolha pelo entregador da plataforma.</p>}
        {(o.status === "ACCEPTED" || o.status === "PREPARING") && <ReasonForm action={orderTransitionAction} hidden={{ id: o.id, to: "CANCELLED" }} label="Cancelar" variant="danger" confirmMessage="Cancelar este pedido? O cliente será notificado." />}
      </div>
    </article>
  );
}

async function History({ ctx, sp, tz }: { ctx: { restaurantId: string }; sp: { q?: string; estado?: string; pagina?: string; de?: string; ate?: string }; tz: string }) {
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = day(sp.de) ? zonedToUtc(`${sp.de}T00:00`, tz) : null;
  const to = day(sp.ate) ? zonedToUtc(`${sp.ate}T23:59`, tz) : null;
  const where: Prisma.OrderWhereInput = {
    restaurantId: ctx.restaurantId,
    status: sp.estado && sp.estado in ORDER_STATUS_LABEL ? (sp.estado as OrderStatus) : { not: "PENDING_PAYMENT" },
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(sp.q ? { OR: [{ code: sp.q.replace("#", "").toUpperCase() }, { customerName: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.order.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { items: { select: { id: true, productName: true, quantity: true } } } }),
    db.order.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Pedidos" />
      <Tabs base="/parceiro/pedidos" current="historico" tabs={[["ativos", "Em curso"], ["historico", "Histórico"]]} />
      <FilterBar action="/parceiro/pedidos" q={sp.q} qPlaceholder="Código ou cliente" clearHref="/parceiro/pedidos?tab=historico">
        <input type="hidden" name="tab" value="historico" />
        <FilterSelect name="estado" value={sp.estado} label="Todos os estados" options={Object.entries(ORDER_STATUS_LABEL).filter(([k]) => k !== "PENDING_PAYMENT")} />
        <label className="flex items-center gap-1 text-sm text-muted">De <input type="date" name="de" defaultValue={sp.de} className="h-10 min-w-0 rounded-xl border border-line bg-surface px-2 text-ink" /></label>
        <label className="flex items-center gap-1 text-sm text-muted">Até <input type="date" name="ate" defaultValue={sp.ate} className="h-10 min-w-0 rounded-xl border border-line bg-surface px-2 text-ink" /></label>
      </FilterBar>
      <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={Receipt} title="Ainda não existem pedidos" />}
        columns={[
          { key: "c", header: "Pedido", cell: (r) => <span className="font-mono">#{r.code}</span> },
          { key: "d", header: "Data", cell: (r) => formatDate(r.createdAt, undefined, tz) },
          { key: "n", header: "Cliente", cell: (r) => r.customerName },
          { key: "i", header: "Produtos", cell: (r) => r.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ") },
          { key: "t", header: "Subtotal", cell: (r) => formatMoney(r.subtotalCents, r.currency) },
          { key: "p", header: "Pagamento", cell: (r) => <PaymentStatusBadge status={r.paymentStatus} /> },
          { key: "s", header: "Estado", cell: (r) => <OrderStatusBadge status={r.status} /> },
          { key: "r", header: "Motivo", cell: (r) => r.rejectReason ?? r.cancelReason ?? "", hideOnMobile: true },
        ]} />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/parceiro/pedidos" params={{ tab: "historico", q: sp.q, estado: sp.estado, de: sp.de, ate: sp.ate }} />
    </>
  );
}

