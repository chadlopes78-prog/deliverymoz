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

export default async function PartnerOrders({ searchParams }: { searchParams: Promise<{ tab?: string; pedido?: string; q?: string; estado?: string; pagina?: string; de?: string; ate?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner("orders.manage");
  const settings = await getSettings();
  const tab = sp.tab ?? "ativos";
  if (tab === "historico") return <History ctx={ctx} sp={sp} tz={settings.timezone} />;

  const orders = await db.order.findMany({
    where: { restaurantId: ctx.restaurantId, status: { in: ACTIVE } },
    orderBy: { createdAt: "asc" },
    include: { items: true, delivery: { include: { courier: { include: { user: { select: { name: true, phone: true } } } } } } },
  });
  const columns: { title: string; statuses: OrderStatus[] }[] = [
    { title: "Novos", statuses: ["PLACED"] },
    { title: "Em preparação", statuses: ["ACCEPTED", "PREPARING"] },
    { title: "Prontos", statuses: ["READY_FOR_PICKUP"] },
    { title: "Em entrega", statuses: ["PICKED_UP", "IN_TRANSIT"] },
  ];
  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Pedidos" description="Atualização automática a cada 10 segundos." actions={<NewOrderAlert placedIds={orders.filter((o) => o.status === "PLACED").map((o) => o.id)} />} />
      <Tabs base="/parceiro/pedidos" current={tab} tabs={[["ativos", `Em curso (${orders.length})`], ["historico", "Histórico"]]} />
      {orders.length === 0 ? <EmptyState icon={Receipt} title="Sem pedidos em curso" description="Os novos pedidos aparecem aqui automaticamente." /> : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {columns.map((col) => {
            const list = orders.filter((o) => col.statuses.includes(o.status));
            return (
              <section key={col.title} aria-label={col.title}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">{col.title} <Badge tone={col.title === "Novos" && list.length ? "brand" : "neutral"}>{list.length}</Badge></h2>
                <ul className="space-y-3">
                  {list.map((o) => (
                    <li key={o.id} id={o.id} className={cn("rounded-2xl border bg-surface p-4 text-sm", o.status === "PLACED" ? "border-brand shadow-[0_0_0_3px] shadow-brand/15" : "border-line", sp.pedido === o.id && "ring-2 ring-accent")}>
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-mono text-base font-bold">#{o.code}</p><p className="text-xs text-muted">{formatDate(o.createdAt, { timeStyle: "short" }, settings.timezone)} · {o.customerName}</p></div>
                        <OrderStatusBadge status={o.status} />
                      </div>
                      <ul className="mt-3 space-y-1 border-y border-line py-2">
                        {o.items.map((it) => (
                          <li key={it.id}><span className="font-semibold">{it.quantity}×</span> {it.productName}
                            {Array.isArray(it.options) && (it.options as { name: string }[]).length > 0 && <span className="block pl-5 text-xs text-muted">{(it.options as { name: string }[]).map((x) => x.name).join(", ")}</span>}
                            {it.notes && <span className="block pl-5 text-xs font-semibold text-amber-700">“{it.notes}”</span>}
                          </li>
                        ))}
                      </ul>
                      {o.notesForRestaurant && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Nota: {o.notesForRestaurant}</p>}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">{formatMoney(o.totalCents, o.currency)}</span>
                        <span className="flex items-center gap-1 text-xs text-muted">{PAYMENT_METHOD_LABEL[o.paymentMethod]} <PaymentStatusBadge status={o.paymentStatus} /></span>
                      </div>
                      {o.deliveryMode === "RESTAURANT" && o.status !== "PLACED" && (
                        <div className="mt-2 space-y-0.5 text-xs">
                          <p className="flex items-start gap-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{o.street}, {o.neighborhoodName}{o.addressReference ? ` — ${o.addressReference}` : ""}</p>
                          <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /><a href={`tel:+${o.customerPhone}`} className="text-brand">{formatPhone(o.customerPhone)}</a></p>
                          {o.notesForDelivery && <p className="text-muted">Entrega: {o.notesForDelivery}</p>}
                        </div>
                      )}
                      {o.deliveryMode === "PLATFORM" && o.delivery && (
                        <p className="mt-2 flex items-center gap-1 text-xs"><Bike className="h-3.5 w-3.5" /> {DELIVERY_STATUS_LABEL[o.delivery.status]}{o.delivery.courier ? `: ${o.delivery.courier.user.name}` : ""}</p>
                      )}
                      {o.estimatedReadyAt && ["ACCEPTED", "PREPARING"].includes(o.status) && <p className="mt-1 text-xs text-muted">Pronto previsto: {formatDate(o.estimatedReadyAt, { timeStyle: "short" }, settings.timezone)}</p>}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {o.status === "PLACED" && (
                          <>
                            <ActionForm action={orderTransitionAction} className="flex gap-2">
                              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value="ACCEPTED" />
                              <Select name="prepTimeMinutes" defaultValue="30" className="h-9 w-24" aria-label="Tempo de preparação">{[10, 15, 20, 30, 40, 50, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
                              <SubmitButton size="sm" variant="accent">Aceitar</SubmitButton>
                            </ActionForm>
                            <ReasonForm action={orderTransitionAction} hidden={{ id: o.id, to: "REJECTED" }} label="Recusar" variant="danger" placeholder="Motivo (ex.: produto esgotado)" />
                          </>
                        )}
                        {o.status === "ACCEPTED" && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "PREPARING" }} label="Iniciar preparação" />}
                        {(o.status === "ACCEPTED" || o.status === "PREPARING") && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "READY_FOR_PICKUP" }} label="Marcar pronto" variant="accent" />}
                        {o.deliveryMode === "RESTAURANT" && o.status === "READY_FOR_PICKUP" && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "PICKED_UP" }} label="Saiu para entrega" variant="accent" />}
                        {o.deliveryMode === "RESTAURANT" && o.status === "PICKED_UP" && <QuickAction action={orderTransitionAction} hidden={{ id: o.id, to: "IN_TRANSIT" }} label="A caminho" />}
                        {o.deliveryMode === "RESTAURANT" && (o.status === "PICKED_UP" || o.status === "IN_TRANSIT") && (
                          <ActionForm action={orderTransitionAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="id" value={o.id} /><input type="hidden" name="to" value="DELIVERED" />
                            {o.paymentMethod === "CASH_ON_DELIVERY" && <Checkbox name="cashCollected" required label={`Recebi ${formatMoney(o.totalCents, o.currency)}`} />}
                            <SubmitButton size="sm" variant="accent">Entregue</SubmitButton>
                          </ActionForm>
                        )}
                        {(o.status === "ACCEPTED" || o.status === "PREPARING") && <ReasonForm action={orderTransitionAction} hidden={{ id: o.id, to: "CANCELLED" }} label="Cancelar" variant="danger" confirmMessage="Cancelar este pedido? O cliente será notificado." />}
                      </div>
                    </li>
                  ))}
                  {list.length === 0 && <li className="rounded-2xl border border-dashed border-line p-4 text-center text-xs text-muted">Nenhum</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
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

