import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin, loadActiveUser } from "../authz";
import { shortCode } from "../auth/tokens";
import { rateLimit } from "../rate-limit";
import { notifyUsers, adminUserIds } from "./notifications";

export const TICKET_CATEGORY_LABEL: Record<TicketCategory, string> = {
  ORDER: "Pedido",
  PAYMENT: "Pagamento",
  DELIVERY: "Entrega",
  PRODUCT: "Produto",
  REFUND: "Reembolso",
  ACCOUNT: "Conta",
  RESTAURANT: "Restaurante",
  OTHER: "Outro",
};
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em análise",
  WAITING_CUSTOMER: "A aguardar resposta",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
};
export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" };

export async function createTicket(userId: string, input: { category: TicketCategory; subject: string; message: string; orderCode?: string | null }) {
  await loadActiveUser(userId);
  await rateLimit(`ticket:${userId}`, 10, 3600);
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (subject.length < 3 || message.length < 5) throw new AppError("VALIDATION", "Descreva o assunto e a mensagem.");
  let orderId: string | null = null;
  if (input.orderCode) {
    const o = await db.order.findUnique({ where: { code: input.orderCode.trim().toUpperCase() } });
    if (!o || o.customerId !== userId) throw new AppError("NOT_FOUND", "Pedido não encontrado na sua conta.");
    orderId = o.id;
  }
  const priority: TicketPriority = input.category === "PAYMENT" || input.category === "REFUND" ? "HIGH" : "MEDIUM";
  const ticket = await db.supportTicket.create({
    data: {
      code: shortCode("T", 7),
      creatorId: userId,
      orderId,
      category: input.category,
      priority,
      subject: subject.slice(0, 150),
      messages: { create: { authorId: userId, body: message.slice(0, 4000) } },
    },
  });
  await notifyUsers(await adminUserIds(["SUPPORT"]), {
    type: "TICKET_NEW",
    title: `Novo ticket ${ticket.code}`,
    body: subject,
    link: `/admin/suporte/${ticket.id}`,
  });
  return ticket;
}

export async function getTicketForUser(userId: string, ticketId: string) {
  const t = await db.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, id: true } } } }, order: { select: { code: true } } },
  });
  if (!t || t.creatorId !== userId) return null;
  return t;
}

export async function replyTicket(userId: string, ticketId: string, body: string) {
  const t = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t || t.creatorId !== userId) throw new AppError("NOT_FOUND", "Ticket não encontrado.");
  if (t.status === "CLOSED") throw new AppError("CONFLICT", "Este ticket está fechado.");
  if (!body.trim()) throw new AppError("VALIDATION", "Escreva a mensagem.");
  await db.ticketMessage.create({ data: { ticketId, authorId: userId, body: body.trim().slice(0, 4000) } });
  await db.supportTicket.update({ where: { id: ticketId }, data: { status: t.status === "WAITING_CUSTOMER" || t.status === "RESOLVED" ? "OPEN" : t.status } });
  if (t.assignedToId) await notifyUsers([t.assignedToId], { type: "TICKET_REPLY", title: `Resposta no ticket ${t.code}`, body: body.slice(0, 150), link: `/admin/suporte/${t.id}` });
}

export async function adminReplyTicket(adminId: string, ticketId: string, input: { body: string; isInternal: boolean; status?: TicketStatus; priority?: TicketPriority; assignToMe?: boolean }) {
  await assertAdmin(adminId, "support.manage");
  const t = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t) throw new AppError("NOT_FOUND", "Ticket não encontrado.");
  if (input.body.trim()) {
    await db.ticketMessage.create({ data: { ticketId, authorId: adminId, body: input.body.trim().slice(0, 4000), isInternal: input.isInternal } });
  }
  const status = input.status ?? (input.body.trim() && !input.isInternal && t.status === "OPEN" ? "WAITING_CUSTOMER" : t.status);
  await db.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      priority: input.priority ?? t.priority,
      assignedToId: input.assignToMe ? adminId : t.assignedToId,
      resolvedAt: status === "RESOLVED" || status === "CLOSED" ? (t.resolvedAt ?? new Date()) : null,
    },
  });
  await audit({ actorId: adminId, action: "ticket.update", entityType: "SupportTicket", entityId: ticketId, metadata: { status, internal: input.isInternal } });
  if (input.body.trim() && !input.isInternal) {
    await notifyUsers([t.creatorId], {
      type: "TICKET_UPDATE",
      title: `Atualização do pedido de suporte ${t.code}`,
      body: input.body.trim().slice(0, 200),
      link: `/ajuda/tickets/${t.id}`,
      email: "order",
    });
  }
}
