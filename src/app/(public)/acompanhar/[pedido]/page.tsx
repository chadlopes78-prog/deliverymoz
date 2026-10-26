import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, Phone, MapPin, Bike, LifeBuoy, Smartphone } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getCustomerOrder } from "@/server/services/orders";
import { getSettings } from "@/server/services/settings";
import { OrderStatusBadge, PaymentStatusBadge, PAYMENT_METHOD_LABEL, formatDate } from "@/components/status";
import { ORDER_STATUS_LABEL } from "@/server/services/order-state";
import { AutoRefresh } from "@/components/auto-refresh";
import { PaymentRefresher } from "@/components/public/payment-refresher";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { Input, Textarea } from "@/components/ui/field";
import { StarInput } from "@/components/ui/star-input";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/utils";
import { cancelOrderAction, retryPaymentAction, reviewAction } from "../../actions";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Acompanhar pedido", robots: { index: false } };

const STEPS: { status: OrderStatus[]; label: string }[] = [
  { status: ["PLACED"], label: "Pedido recebido" },
  { status: ["ACCEPTED"], label: "Confirmado" },
  { status: ["PREPARING"], label: "Em preparação" },
  { status: ["READY_FOR_PICKUP"], label: "Pronto" },
  { status: ["PICKED_UP", "IN_TRANSIT"], label: "A caminho" },
  { status: ["DELIVERED"], label: "Entregue" },
];
const ORDER: OrderStatus[] = ["PENDING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];

export default async function TrackPage({ params, searchParams }: { params: Promise<{ pedido: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { pedido } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/acompanhar/${pedido}`);
  const order = await getCustomerOrder(user.id, pedido.toUpperCase());
  if (!order) notFound();
  const settings = await getSettings();
  const c = order.currency;
  const payment = order.payments[0];
  const ended = ["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status);
  const idx = ORDER.indexOf(order.status);
  const courier = order.delivery?.courier;
  const showLocation = courier?.lastLocationAt && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(order.delivery!.status) && Date.now() - courier.lastLocationAt.getTime() < 15 * 60_000;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {!ended && (order.status === "PENDING_PAYMENT" && payment?.status === "PROCESSING" ? <PaymentRefresher code={order.code} /> : <AutoRefresh seconds={20} />)}
      {sp.novo && order.status !== "PENDING_PAYMENT" && (
        <p className="mb-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Pedido enviado com sucesso! O restaurante já foi notificado.</p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Pedido <span className="font-mono font-semibold text-ink">#{order.code}</span></p>
          <h1 className="text-xl font-bold sm:text-2xl">{ORDER_STATUS_LABEL[order.status]}</h1>
          <p className="text-sm text-muted">{order.restaurant.name} · {formatDate(order.createdAt, undefined, settings.timezone)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5" /> Pagamento {PAYMENT_METHOD_LABEL[order.paymentMethod]}</h2>
          {payment?.status === "PROCESSING" ? (
            <p className="mt-1 text-sm">Confirme o pagamento de <strong>{formatMoney(order.totalCents, c)}</strong> no seu telemóvel. Esta página atualiza automaticamente.</p>
          ) : (
            <>
              <p className="mt-1 text-sm">{payment?.status === "FAILED" ? `O pagamento falhou: ${payment.failureMessage ?? "tente novamente."}` : "O pagamento ainda não foi iniciado."}</p>
              <ActionForm action={retryPaymentAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="code" value={order.code} />
                <Input name="payerPhone" type="tel" inputMode="tel" defaultValue={payment?.payerPhone?.replace(/^258/, "") ?? ""} aria-label="Número de telefone para pagamento" placeholder="84 123 4567" className="sm:max-w-48" />
                <SubmitButton pendingText="A aguardar confirmação…">Pagar {formatMoney(order.totalCents, c)}</SubmitButton>
              </ActionForm>
            </>
          )}
          <p className="mt-2 text-xs text-muted">O pedido só é enviado ao restaurante depois de o pagamento ser confirmado pelo fornecedor. Sem pagamento em {settings.paymentTimeoutMinutes} minutos, o pedido é cancelado automaticamente.</p>
        </section>
      )}

      {!["CANCELLED", "REJECTED", "PENDING_PAYMENT"].includes(order.status) && (
        <ol className="mt-6 grid grid-cols-6 gap-1" aria-label="Progresso do pedido">
          {STEPS.map((s, i) => {
            const stepIdx = Math.max(...s.status.map((x) => ORDER.indexOf(x)));
            const minIdx = Math.min(...s.status.map((x) => ORDER.indexOf(x)));
            const done = idx >= minIdx;
            const current = s.status.includes(order.status);
            return (
              <li key={s.label} className="flex flex-col items-center text-center" aria-current={current ? "step" : undefined}>
                <span className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-bold", done ? "bg-brand text-brand-contrast" : "bg-ink/10 text-muted", current && "ring-4 ring-brand/20")}>
                  {done && idx > stepIdx ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("mt-1 text-[10px] leading-tight sm:text-xs", done ? "font-semibold" : "text-muted")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      {order.estimatedReadyAt && ["ACCEPTED", "PREPARING"].includes(order.status) && (
        <p className="mt-3 text-center text-sm text-muted">Previsão de conclusão da preparação: <strong>{formatDate(order.estimatedReadyAt, { timeStyle: "short" }, settings.timezone)}</strong></p>
      )}
      {(order.status === "CANCELLED" || order.status === "REJECTED") && (
        <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
          {order.status === "REJECTED" ? `O restaurante recusou o pedido. ${order.rejectReason ?? ""}` : `Pedido cancelado. ${order.cancelReason ?? ""}`}
          {order.paymentStatus === "REFUND_PENDING" && " O reembolso será processado pela nossa equipa."}
          {order.paymentStatus === "REFUNDED" && " O valor foi reembolsado."}
        </p>
      )}

      {courier && order.deliveryMode === "PLATFORM" && !ended && (
        <section className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/10 text-accent"><Bike className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{courier.user.name.split(" ")[0]} é o seu entregador</p>
            {showLocation ? (
              <a className="text-brand underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${courier.lastLatitude},${courier.lastLongitude}`}>Ver última localização partilhada ({formatDate(courier.lastLocationAt, { timeStyle: "short" }, settings.timezone)})</a>
            ) : (
              <p className="text-muted">A localização em tempo real aparece apenas quando o entregador a partilha.</p>
            )}
          </div>
          {courier.user.phone && <a href={`tel:+${courier.user.phone}`} className={buttonClass("outline", "icon")} aria-label="Ligar ao entregador"><Phone className="h-4 w-4" /></a>}
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-line bg-surface p-4 text-sm">
        <h2 className="mb-3 font-semibold">Itens</h2>
        <ul className="space-y-2">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3">
              <span><span className="font-semibold">{it.quantity}×</span> {it.productName}
                {Array.isArray(it.options) && (it.options as { name: string }[]).length > 0 && <span className="block text-xs text-muted">{(it.options as { name: string }[]).map((o) => o.name).join(", ")}</span>}
                {it.notes && <span className="block text-xs italic text-muted">“{it.notes}”</span>}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(it.totalCents, c)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(order.subtotalCents, c)}</dd></div>
          {order.discountCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Desconto</dt><dd>−{formatMoney(order.discountCents, c)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Entrega</dt><dd>{formatMoney(order.deliveryFeeCents, c)}</dd></div>
          {order.serviceFeeCents > 0 && <div className="flex justify-between"><dt className="text-muted">Taxa de serviço</dt><dd>{formatMoney(order.serviceFeeCents, c)}</dd></div>}
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{formatMoney(order.totalCents, c)}</dd></div>
          <div className="flex items-center justify-between pt-1"><dt className="text-muted">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</dt><dd><PaymentStatusBadge status={order.paymentStatus} /></dd></div>
        </dl>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Entrega</h2>
          <p>{order.street}, {order.neighborhoodName}, {order.cityName}</p>
          {order.addressReference && <p className="text-muted">Ref.: {order.addressReference}</p>}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-1 font-semibold">Precisa de ajuda?</h2>
          <a href={`tel:+${order.restaurant.phone}`} className="flex items-center gap-2 text-brand"><Phone className="h-4 w-4" /> {formatPhone(order.restaurant.phone)}</a>
          <Link href={`/ajuda?pedido=${order.code}`} className="mt-1 flex items-center gap-2 text-brand"><LifeBuoy className="h-4 w-4" /> Abrir pedido de suporte</Link>
        </div>
      </section>

      {(order.status === "PLACED" || order.status === "PENDING_PAYMENT") && (settings.customerCancelWindow === "BEFORE_ACCEPT" || order.status === "PENDING_PAYMENT") && (
        <ActionForm action={cancelOrderAction} confirmMessage="Tem a certeza que quer cancelar o pedido?" className="mt-5 rounded-2xl border border-line bg-surface p-4">
          <input type="hidden" name="code" value={order.code} />
          <label htmlFor="cancel-reason" className="text-sm font-semibold">Cancelar pedido</label>
          <p className="text-xs text-muted">Só é possível cancelar antes de o restaurante aceitar o pedido.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input id="cancel-reason" name="reason" placeholder="Motivo (opcional)" maxLength={300} />
            <SubmitButton variant="outline" className="text-red-600">Cancelar pedido</SubmitButton>
          </div>
        </ActionForm>
      )}

      {order.status === "DELIVERED" && !order.review && (
        <ActionForm action={reviewAction} className="mt-5 rounded-2xl border border-line bg-surface p-4">
          <input type="hidden" name="code" value={order.code} />
          <h2 className="font-semibold">Como foi o seu pedido?</h2>
          <StarInput />
          <Textarea name="comment" maxLength={1000} placeholder="Conte como foi (opcional)" className="mt-2" />
          <SubmitButton className="mt-3">Enviar avaliação</SubmitButton>
        </ActionForm>
      )}
      {order.review && <p className="mt-5 text-center text-sm text-muted">Avaliou este pedido com {order.review.rating} estrela(s). Obrigado!</p>}

      <section className="mt-5 rounded-2xl border border-line bg-surface p-4 text-sm">
        <h2 className="mb-3 font-semibold">Histórico</h2>
        <ol className="space-y-2 border-l-2 border-line pl-4">
          {order.events.map((e) => (
            <li key={e.id}>
              <p className="font-medium">{ORDER_STATUS_LABEL[e.toStatus]}</p>
              <p className="text-xs text-muted">{formatDate(e.createdAt, undefined, settings.timezone)}{e.note ? ` · ${e.note}` : ""}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
