import type { PaymentProviderKey } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { randomToken } from "../auth/tokens";
import { normalizeMzPhone } from "@/lib/utils";
import { audit, logError } from "../audit";
import { assertAdmin, loadActiveUser } from "../authz";
import { getProvider } from "../payments/registry";
import type { PaymentForProvider, ProviderOutcome } from "../payments/types";
import { onOrderPlaced, transitionOrder } from "./orders";
import { notifyUsers, adminUserIds } from "./notifications";
import { getSettingsUncached } from "./settings";

function newReference() {
  return `P${randomToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12)}`;
}

async function toProviderPayment(paymentId: string): Promise<PaymentForProvider> {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { select: { code: true } } } });
  return {
    id: p.id,
    reference: p.reference,
    amountCents: p.amountCents,
    currency: p.currency,
    payerPhone: p.payerPhone,
    providerTransactionId: p.providerTransactionId,
    orderCode: p.order.code,
  };
}

function sanitize(raw: unknown) {
  try {
    return JSON.parse(JSON.stringify(raw ?? null));
  } catch {
    return null;
  }
}

/**
 * Aplica o resultado de um fornecedor a um pagamento de forma idempotente.
 * Apenas resultados obtidos diretamente do fornecedor (resposta HTTPS, consulta de estado
 * ou webhook com assinatura válida) devem chegar aqui. O redirecionamento do navegador nunca confirma pagamentos.
 */
export async function applyProviderOutcome(paymentId: string, outcome: ProviderOutcome, source: string) {
  const now = new Date();
  let becamePaid = false;
  let lateRefund = false;
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    await tx.paymentEvent.create({ data: { paymentId, type: `${source}:${outcome.status}`, data: sanitize(outcome.raw) } });

    if (outcome.status === "PAID") {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["PENDING", "PROCESSING", "FAILED", "CANCELLED"] } },
        data: {
          status: "PAID",
          paidAt: now,
          providerTransactionId: outcome.providerTransactionId ?? payment.providerTransactionId,
          providerConversationId: outcome.conversationId ?? payment.providerConversationId,
          failureCode: null,
          failureMessage: null,
        },
      });
      if (res.count === 0) return; // já processado (idempotência)
      const placed = await tx.order.updateMany({
        where: { id: payment.orderId, status: "PENDING_PAYMENT" },
        data: { status: "PLACED", paymentStatus: "PAID", placedAt: now },
      });
      if (placed.count === 1) {
        await tx.orderStatusEvent.create({
          data: { orderId: payment.orderId, fromStatus: "PENDING_PAYMENT", toStatus: "PLACED", actorRole: "SYSTEM", note: "Pagamento confirmado pelo fornecedor" },
        });
        becamePaid = true;
      } else {
        // Pagamento chegou depois de o pedido ter sido cancelado/expirado: reembolso obrigatório.
        await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "REFUND_PENDING" } });
        await tx.refund.create({
          data: { orderId: payment.orderId, paymentId, amountCents: payment.amountCents, reason: "Pagamento recebido após cancelamento do pedido" },
        });
        lateRefund = true;
      }
    } else if (outcome.status === "FAILED") {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "FAILED", failureCode: outcome.failureCode ?? null, failureMessage: outcome.failureMessage },
      });
      if (res.count === 1) {
        await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" }, data: { paymentStatus: "FAILED" } });
      }
    } else {
      await tx.payment.updateMany({
        where: { id: paymentId, status: "PENDING" },
        data: {
          status: "PROCESSING",
          providerTransactionId: outcome.providerTransactionId ?? undefined,
          providerConversationId: outcome.conversationId ?? undefined,
        },
      });
      await tx.order.updateMany({ where: { id: payment.orderId, status: "PENDING_PAYMENT" }, data: { paymentStatus: "PROCESSING" } });
    }
  });

  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
  if (becamePaid) {
    await onOrderPlaced(payment.orderId);
  } else if (outcome.status === "FAILED" && payment.status === "FAILED") {
    await notifyUsers([payment.order.customerId], {
      type: "PAYMENT_FAILED",
      title: `Pagamento do pedido #${payment.order.code} falhou`,
      body: outcome.failureMessage,
      link: `/acompanhar/${payment.order.code}`,
    });
  }
  if (lateRefund) {
    await notifyUsers(await adminUserIds(["FINANCE"]), {
      type: "REFUND_REQUIRED",
      title: "Reembolso necessário",
      body: `O pagamento do pedido #${payment.order.code} foi confirmado depois de o pedido ter sido cancelado.`,
      link: "/admin/financeiro?tab=reembolsos",
    });
  }
  return payment;
}

/** O cliente inicia (ou repete) o pagamento online de um pedido que aguarda pagamento. */
export async function startPayment(userId: string, orderCode: string, payerPhoneRaw?: string | null) {
  await loadActiveUser(userId);
  const order = await db.order.findUnique({ where: { code: orderCode }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  if (!order || order.customerId !== userId) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
  if (order.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", "Este pedido já não aguarda pagamento.");
  const provider = getProvider(order.paymentMethod);
  const config = await db.paymentProviderConfig.findUnique({ where: { key: order.paymentMethod } });
  if (!provider || !provider.initiate || !config?.enabled || provider.missingConfig().length) {
    throw new AppError("UNAVAILABLE", "Este método de pagamento não está disponível.");
  }
  const latest = order.payments[0];
  if (latest?.status === "PROCESSING") throw new AppError("CONFLICT", "Já existe um pagamento em processamento. Confirme no seu telemóvel ou aguarde.");
  if (latest?.status === "PAID") throw new AppError("CONFLICT", "Este pedido já está pago.");

  let payerPhone = latest?.payerPhone ?? null;
  if (payerPhoneRaw) {
    payerPhone = normalizeMzPhone(payerPhoneRaw);
    if (!payerPhone) throw new AppError("VALIDATION", "Número de telefone inválido.");
  }

  // Cada tentativa usa uma nova referência (exigência habitual dos fornecedores para evitar duplicados).
  let paymentId: string;
  if (latest && latest.status === "PENDING" && latest.attempts === 0) {
    paymentId = latest.id;
    await db.payment.update({ where: { id: latest.id }, data: { payerPhone, attempts: 1, status: "PROCESSING" } });
  } else {
    const p = await db.payment.create({
      data: {
        orderId: order.id,
        provider: order.paymentMethod,
        status: "PROCESSING",
        amountCents: order.totalCents,
        currency: order.currency,
        reference: newReference(),
        payerPhone,
        attempts: 1,
        events: { create: { type: "CREATED_RETRY" } },
      },
    });
    paymentId = p.id;
  }
  await db.order.update({ where: { id: order.id }, data: { paymentStatus: "PROCESSING" } });

  let outcome: ProviderOutcome;
  try {
    outcome = await provider.initiate(await toProviderPayment(paymentId));
  } catch (e) {
    await logError("payments.initiate", e, { paymentId });
    outcome = { status: "PROCESSING", raw: { error: "exception" } };
  }
  return applyProviderOutcome(paymentId, outcome, "INITIATE");
}

/** Consulta o estado junto do fornecedor (reconciliação). */
export async function refreshPaymentStatus(paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PROCESSING") return payment;
  const provider = getProvider(payment.provider);
  if (!provider?.queryStatus || provider.missingConfig().length) return payment;
  await db.payment.update({ where: { id: paymentId }, data: { lastCheckedAt: new Date() } });
  try {
    const outcome = await provider.queryStatus(await toProviderPayment(paymentId));
    return applyProviderOutcome(paymentId, outcome, "QUERY");
  } catch (e) {
    await logError("payments.query", e, { paymentId });
    return payment;
  }
}

export async function customerRefreshPayment(userId: string, orderCode: string) {
  const order = await db.order.findUnique({ where: { code: orderCode }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!order || order.customerId !== userId) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
  const p = order.payments[0];
  if (p && p.status === "PROCESSING" && (!p.lastCheckedAt || Date.now() - p.lastCheckedAt.getTime() > 15_000)) {
    await refreshPaymentStatus(p.id);
  }
}

/**
 * Processa um webhook. A assinatura é validada pelo adaptador; eventos repetidos são ignorados
 * (tabela WebhookEvent com chave única por fornecedor+evento).
 */
export async function processWebhook(providerKey: PaymentProviderKey, rawBody: string, headers: Headers) {
  const provider = getProvider(providerKey);
  if (!provider?.parseWebhook) throw new AppError("NOT_FOUND", "Fornecedor sem webhooks.");
  let parsed;
  try {
    parsed = await provider.parseWebhook(rawBody, headers);
  } catch (e) {
    await logError("webhook.invalid", e, { provider: providerKey });
    throw new AppError("FORBIDDEN", "Assinatura inválida.");
  }
  let event;
  try {
    event = await db.webhookEvent.create({
      data: { provider: providerKey, eventId: parsed.eventId, signatureValid: true, payload: sanitize(JSON.parse(rawBody)) },
    });
  } catch {
    return { duplicate: true };
  }
  const payment = await db.payment.findUnique({ where: { reference: parsed.reference } });
  if (!payment || payment.provider !== providerKey) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: "Pagamento não encontrado", processedAt: new Date() } });
    return { duplicate: false, ignored: true };
  }
  await applyProviderOutcome(payment.id, parsed.outcome, "WEBHOOK");
  await db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  return { duplicate: false };
}

/** Tarefa periódica: reconcilia pagamentos incertos e cancela pedidos cujo pagamento expirou. */
export async function reconcilePayments() {
  const settings = await getSettingsUncached();
  const processing = await db.payment.findMany({
    where: { status: "PROCESSING", OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 60_000) } }] },
    take: 50,
  });
  for (const p of processing) await refreshPaymentStatus(p.id);

  const cutoff = new Date(Date.now() - settings.paymentTimeoutMinutes * 60_000);
  const stale = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: cutoff } },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
    take: 100,
  });
  let expired = 0;
  for (const o of stale) {
    // Não cancelar enquanto houver um pagamento em processamento recente (ainda incerto).
    const p = o.payments[0];
    if (p?.status === "PROCESSING" && p.updatedAt > new Date(Date.now() - 2 * settings.paymentTimeoutMinutes * 60_000)) continue;
    try {
      await transitionOrder({ role: "SYSTEM", userId: null }, o.id, "CANCELLED", { reason: "Pagamento não concluído dentro do prazo" });
      expired++;
    } catch {
      /* alterado entretanto */
    }
  }
  return { checked: processing.length, expired };
}

// ─────────────────────────── Reembolsos ───────────────────────────

export async function requestRefund(adminId: string, orderId: string, amountCents: number, reason: string) {
  await assertAdmin(adminId, "finance.manage");
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true, refunds: true } });
  if (!order) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
  const paid = order.payments.find((p) => p.status === "PAID" || p.status === "PARTIALLY_REFUNDED");
  if (!paid) throw new AppError("CONFLICT", "Não existe pagamento confirmado para reembolsar.");
  const already = order.refunds.filter((r) => r.status !== "FAILED" && r.status !== "REJECTED").reduce((s, r) => s + r.amountCents, 0);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents + already > paid.amountCents)
    throw new AppError("VALIDATION", "Valor de reembolso inválido.");
  if (!reason.trim()) throw new AppError("VALIDATION", "Indique o motivo.");
  const refund = await db.refund.create({
    data: { orderId, paymentId: paid.id, amountCents, reason: reason.trim(), requestedById: adminId },
  });
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUND_PENDING" } });
  await audit({ actorId: adminId, action: "refund.request", entityType: "Order", entityId: orderId, metadata: { amountCents, reason } });
  return refund;
}

/**
 * Conclui um reembolso. Modo PROVIDER chama a API do fornecedor (quando suportado);
 * modo MANUAL regista um reembolso feito fora do sistema e exige referência da transação.
 */
export async function processRefund(
  adminId: string,
  refundId: string,
  input: { mode: "PROVIDER" | "MANUAL" | "REJECT"; reference?: string | null; notes?: string | null },
) {
  await assertAdmin(adminId, "finance.manage");
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { payment: true, order: true } });
  if (!refund) throw new AppError("NOT_FOUND", "Reembolso não encontrado.");
  if (refund.status !== "PENDING" && refund.status !== "FAILED") throw new AppError("CONFLICT", "Este reembolso já foi tratado.");

  if (input.mode === "REJECT") {
    if (!input.notes?.trim()) throw new AppError("VALIDATION", "Indique o motivo da recusa.");
    await db.refund.update({ where: { id: refundId }, data: { status: "REJECTED", processedById: adminId, processedAt: new Date(), notes: input.notes } });
    await syncOrderRefundStatus(refund.orderId);
    await audit({ actorId: adminId, action: "refund.reject", entityType: "Refund", entityId: refundId, metadata: { notes: input.notes } });
    return;
  }

  let providerRef = input.reference?.trim() || null;
  if (input.mode === "PROVIDER") {
    const provider = refund.payment ? getProvider(refund.payment.provider) : null;
    if (!provider?.refund || provider.missingConfig().length) throw new AppError("UNAVAILABLE", "O fornecedor não suporta reembolso automático. Use o registo manual.");
    const claimed = await db.refund.updateMany({ where: { id: refundId, status: { in: ["PENDING", "FAILED"] } }, data: { status: "PROCESSING" } });
    if (claimed.count !== 1) throw new AppError("CONFLICT", "Reembolso já em processamento.");
    const r = await provider.refund(await toProviderPayment(refund.paymentId!), refund.amountCents);
    if (!r.ok) {
      await db.refund.update({ where: { id: refundId }, data: { status: "FAILED", notes: r.message ?? "Falhou" } });
      throw new AppError("PAYMENT", r.message ?? "O reembolso falhou no fornecedor.");
    }
    providerRef = r.reference ?? null;
  } else if (!providerRef) {
    throw new AppError("VALIDATION", "Indique a referência da transação de reembolso.");
  }

  await db.refund.update({
    where: { id: refundId },
    data: { status: "COMPLETED", providerRef, processedById: adminId, processedAt: new Date(), notes: input.notes ?? null },
  });
  await syncOrderRefundStatus(refund.orderId);
  await audit({ actorId: adminId, action: `refund.complete_${input.mode.toLowerCase()}`, entityType: "Refund", entityId: refundId, metadata: { providerRef } });
  await notifyUsers([refund.order.customerId], {
    type: "REFUND_COMPLETED",
    title: `Reembolso do pedido #${refund.order.code}`,
    body: "O seu reembolso foi processado.",
    link: `/acompanhar/${refund.order.code}`,
    email: "order",
  });
}

async function syncOrderRefundStatus(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { refunds: true, payments: true } });
  const paid = order.payments.find((p) => p.paidAt);
  if (!paid) return;
  const done = order.refunds.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.amountCents, 0);
  const pending = order.refunds.some((r) => r.status === "PENDING" || r.status === "PROCESSING");
  const status = pending ? "REFUND_PENDING" : done === 0 ? "PAID" : done >= paid.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
  if (done > 0) await db.payment.update({ where: { id: paid.id }, data: { status: done >= paid.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
}
