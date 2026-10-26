import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { allowedNextStatuses, ORDER_STATUS_LABEL } from "@/server/services/order-state";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { OrderStatusBadge, PaymentStatusBadge, PAYMENT_METHOD_LABEL, DELIVERY_MODE_LABEL, DELIVERY_STATUS_LABEL, formatDate } from "@/components/status";
import { formatMoney, centsToInput } from "@/lib/money";
import { formatPhone } from "@/lib/utils";
import { adminOrderStatusAction, requestRefundAction, adminCheckPaymentAction } from "../../actions";

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin("orders.view");
  const o = await db.order.findUnique({
    where: { id },
    include: {
      items: true, restaurant: { select: { id: true, name: true, phone: true } }, customer: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      payments: { orderBy: { createdAt: "desc" }, include: { events: { orderBy: { createdAt: "asc" } } } },
      refunds: { orderBy: { createdAt: "desc" } },
      delivery: { include: { courier: { include: { user: { select: { name: true, phone: true } } } }, offers: true, issues: true } },
      coupon: { select: { code: true } }, review: true, tickets: { select: { id: true, code: true, subject: true } },
    },
  });
  if (!o) notFound();
  const settings = await getSettings();
  const c = o.currency;
  const canIntervene = hasAdminPermission(admin, "orders.intervene");
  const next = allowedNextStatuses(o.status, "ADMIN", o.deliveryMode);
  const audits = await db.auditLog.findMany({ where: { entityType: "Order", entityId: o.id }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } });
  const refundable = o.payments.find((p) => p.status === "PAID" || p.status === "PARTIALLY_REFUNDED");
  const refundedOrPending = o.refunds.filter((r) => !["FAILED", "REJECTED"].includes(r.status)).reduce((s, r) => s + r.amountCents, 0);
  return (
    <>
      <Link href="/admin/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pedidos</Link>
      <PageHeader title={`Pedido #${o.code}`} description={`${formatDate(o.createdAt, undefined, settings.timezone)} · ${DELIVERY_MODE_LABEL[o.deliveryMode]}`} actions={<><OrderStatusBadge status={o.status} /><PaymentStatusBadge status={o.paymentStatus} /></>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Itens e valores" />
            <CardBody className="text-sm">
              <ul className="space-y-1.5">{o.items.map((it) => <li key={it.id} className="flex justify-between gap-2"><span>{it.quantity}× {it.productName}{Array.isArray(it.options) && (it.options as { name: string }[]).length ? <span className="text-muted"> ({(it.options as { name: string }[]).map((x) => x.name).join(", ")})</span> : null}{it.notes && <span className="block text-xs italic text-muted">“{it.notes}”</span>}</span><span className="tabular-nums">{formatMoney(it.totalCents, c)}</span></li>)}</ul>
              <dl className="mt-3 grid gap-1 border-t border-line pt-3 sm:grid-cols-2">
                <div className="flex justify-between sm:pr-4"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(o.subtotalCents, c)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Desconto {o.coupon ? `(${o.coupon.code}, ${o.discountFundedBy === "RESTAURANT" ? "restaurante" : "plataforma"})` : ""}</dt><dd>−{formatMoney(o.discountCents, c)}</dd></div>
                <div className="flex justify-between sm:pr-4"><dt className="text-muted">Taxa de entrega</dt><dd>{formatMoney(o.deliveryFeeCents, c)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Taxa de serviço</dt><dd>{formatMoney(o.serviceFeeCents, c)}</dd></div>
                <div className="flex justify-between font-bold sm:pr-4"><dt>Total</dt><dd>{formatMoney(o.totalCents, c)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Comissão ({(o.commissionBps / 100).toFixed(2)}%)</dt><dd>{formatMoney(o.commissionCents, c)}</dd></div>
                <div className="flex justify-between sm:pr-4"><dt className="text-muted">Líquido restaurante</dt><dd>{formatMoney(o.restaurantNetCents, c)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Entregador</dt><dd>{formatMoney(o.courierFeeCents, c)}</dd></div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pagamentos" description={PAYMENT_METHOD_LABEL[o.paymentMethod]} />
            <CardBody className="space-y-4 text-sm">
              {o.payments.map((p) => (
                <div key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{p.reference}</span>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-muted">{formatMoney(p.amountCents, p.currency)} · tentativas: {p.attempts}{p.providerTransactionId ? ` · ID fornecedor: ${p.providerTransactionId}` : ""}{p.paidAt ? ` · pago em ${formatDate(p.paidAt)}` : ""}</p>
                  {p.failureMessage && <p className="text-red-600">{p.failureCode}: {p.failureMessage}</p>}
                  <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-brand">Eventos ({p.events.length})</summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">{p.events.map((e) => <li key={e.id}>{formatDate(e.createdAt)} · {e.type}</li>)}</ul>
                  </details>
                  {p.status === "PROCESSING" && <div className="mt-2"><QuickAction action={adminCheckPaymentAction} hidden={{ paymentId: p.id }} label="Consultar estado no fornecedor" /></div>}
                </div>
              ))}
              {o.refunds.length > 0 && (
                <div><p className="font-semibold">Reembolsos</p>{o.refunds.map((r) => <p key={r.id} className="flex justify-between"><span>{formatMoney(r.amountCents, c)} · {r.reason}</span><Badge tone={r.status === "COMPLETED" ? "green" : "yellow"}>{r.status}</Badge></p>)}<Link href="/admin/financeiro?tab=reembolsos" className="text-xs font-semibold text-brand">Gerir em Financeiro</Link></div>
              )}
              {hasAdminPermission(admin, "finance.manage") && refundable && refundedOrPending < refundable.amountCents && (
                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer font-semibold">Registar pedido de reembolso</summary>
                  <ActionForm action={requestRefundAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="orderId" value={o.id} />
                    <Field label={`Valor (${c})`} htmlFor="ramount"><Input id="ramount" name="amount" inputMode="decimal" defaultValue={centsToInput(refundable.amountCents - refundedOrPending)} required /></Field>
                    <Field label="Motivo" htmlFor="rreason"><Input id="rreason" name="reason" required /></Field>
                    <div className="sm:col-span-2"><SubmitButton size="sm">Registar</SubmitButton></div>
                  </ActionForm>
                </details>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Histórico de alterações" />
            <CardBody>
              <ol className="space-y-2 border-l-2 border-line pl-4 text-sm">
                {o.events.map((e) => <li key={e.id}><p className="font-medium">{e.fromStatus ? `${ORDER_STATUS_LABEL[e.fromStatus]} → ` : ""}{ORDER_STATUS_LABEL[e.toStatus]}</p><p className="text-xs text-muted">{formatDate(e.createdAt, undefined, settings.timezone)} · {e.actorRole}{e.actor ? ` (${e.actor.name})` : ""}{e.note ? ` · ${e.note}` : ""}</p></li>)}
              </ol>
              {audits.length > 0 && <div className="mt-4"><p className="text-sm font-semibold">Intervenções administrativas</p>{audits.map((a) => <p key={a.id} className="text-xs text-muted">{formatDate(a.createdAt)} · {a.actor?.name} · {a.action} {a.metadata ? JSON.stringify(a.metadata) : ""}</p>)}</div>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          {canIntervene && next.length > 0 && (
            <Card>
              <CardHeader title="Intervenção" description="Fica registada na auditoria." />
              <CardBody>
                <ActionForm action={adminOrderStatusAction} className="space-y-3" confirmMessage="Confirmar alteração de estado do pedido?">
                  <input type="hidden" name="id" value={o.id} />
                  <Field label="Novo estado" htmlFor="to"><Select id="to" name="to">{next.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</Select></Field>
                  <Field label="Motivo" htmlFor="areason"><Input id="areason" name="reason" required /></Field>
                  {o.paymentMethod === "CASH_ON_DELIVERY" && next.includes("DELIVERED") && <Checkbox name="cashCollected" label="Numerário recebido (para marcar como entregue)" />}
                  <SubmitButton size="sm" className="w-full">Aplicar</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Cliente" />
            <CardBody className="space-y-1 text-sm">
              <p><Link href={`/admin/clientes/${o.customer.id}`} className="font-semibold text-brand">{o.customerName}</Link></p>
              <p>{formatPhone(o.customerPhone)} · {o.customer.email}</p>
              <p className="text-muted">{o.street}, {o.neighborhoodName}, {o.cityName}</p>
              {o.addressReference && <p className="text-muted">Ref.: {o.addressReference}</p>}
              {o.notesForRestaurant && <p><span className="text-muted">Nota restaurante:</span> {o.notesForRestaurant}</p>}
              {o.notesForDelivery && <p><span className="text-muted">Nota entrega:</span> {o.notesForDelivery}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Restaurante" />
            <CardBody className="text-sm"><Link href={`/admin/restaurantes/${o.restaurant.id}`} className="font-semibold text-brand">{o.restaurant.name}</Link><p>{formatPhone(o.restaurant.phone)}</p></CardBody>
          </Card>
          {o.delivery && (
            <Card>
              <CardHeader title="Entrega" />
              <CardBody className="space-y-1 text-sm">
                <p><Badge>{DELIVERY_STATUS_LABEL[o.delivery.status]}</Badge></p>
                <p>{o.delivery.courier ? <Link href={`/admin/entregadores/${o.delivery.courier.id}`} className="text-brand">{o.delivery.courier.user.name}</Link> : "Sem entregador"} · ofertas: {o.delivery.offers.length}</p>
                {o.delivery.issues.map((i) => <p key={i.id} className="text-red-600">{i.type}: {i.description}</p>)}
                <Link href="/admin/entregas" className="text-xs font-semibold text-brand">Gerir em Entregas</Link>
              </CardBody>
            </Card>
          )}
          {(o.cancelReason || o.rejectReason) && <Card><CardBody className="text-sm"><p className="font-semibold">Motivo de {o.status === "REJECTED" ? "recusa" : "cancelamento"}</p><p className="text-muted">{o.rejectReason ?? o.cancelReason} {o.cancelledByRole && `(${o.cancelledByRole})`}</p></CardBody></Card>}
          {o.tickets.length > 0 && <Card><CardHeader title="Tickets" /><CardBody className="text-sm">{o.tickets.map((t) => <Link key={t.id} href={`/admin/suporte/${t.id}`} className="block text-brand">{t.code} — {t.subject}</Link>)}</CardBody></Card>}
        </div>
      </div>
    </>
  );
}
