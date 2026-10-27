import type { OrderStatus } from "@prisma/client";
import { db } from "../db";

/**
 * Atividade da plataforma, construída a partir de registos reais:
 * auditoria (ações administrativas e de segurança), eventos de pedidos, novas contas e novos produtos.
 * Nunca inclui palavras-passe, tokens ou dados de pagamento: só o tipo de evento, a entidade e o autor.
 */
export type ActivityKind = "contas" | "restaurantes" | "produtos" | "pedidos" | "administracao";

export type ActivityItem = {
  id: string;
  at: Date;
  kind: ActivityKind;
  title: string;
  detail?: string | null;
  actor?: string | null;
  href?: string | null;
};

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  contas: "Contas",
  restaurantes: "Restaurantes",
  produtos: "Produtos",
  pedidos: "Pedidos",
  administracao: "Administração",
};

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "a aguardar pagamento",
  PLACED: "recebido",
  ACCEPTED: "aceite",
  PREPARING: "em preparação",
  READY_FOR_PICKUP: "pronto",
  PICKED_UP: "recolhido",
  IN_TRANSIT: "a caminho",
  DELIVERED: "entregue",
  REJECTED: "recusado",
  CANCELLED: "cancelado",
};

/** Ações de auditoria apresentadas no feed (as restantes ficam só em Segurança e auditoria). */
const AUDIT: Record<string, { kind: ActivityKind; title: string }> = {
  "restaurant.apply": { kind: "restaurantes", title: "Nova candidatura de restaurante" },
  "restaurant.admin_create": { kind: "restaurantes", title: "Restaurante criado pelo admin" },
  "restaurant.approved": { kind: "restaurantes", title: "Restaurante aprovado" },
  "restaurant.rejected": { kind: "restaurantes", title: "Candidatura rejeitada" },
  "restaurant.suspended": { kind: "restaurantes", title: "Restaurante suspenso" },
  "restaurant.pause": { kind: "restaurantes", title: "Loja pausada" },
  "restaurant.resume": { kind: "restaurantes", title: "Loja reativada" },
  "restaurant.publish": { kind: "restaurantes", title: "Restaurante publicado" },
  "restaurant.unpublish": { kind: "restaurantes", title: "Restaurante despublicado" },
  "setup.owner_activated": { kind: "administracao", title: "Conta ativada como proprietário" },
  "restaurant.admin_update": { kind: "restaurantes", title: "Dados do restaurante alterados" },
  "restaurant.owner_assign": { kind: "restaurantes", title: "Proprietário associado a restaurante" },
  "user.suspend": { kind: "contas", title: "Conta suspensa" },
  "user.ban": { kind: "contas", title: "Conta banida" },
  "user.reactivate": { kind: "contas", title: "Conta reativada" },
  "user.close_account": { kind: "contas", title: "Conta encerrada pelo titular" },
  "courier.apply": { kind: "contas", title: "Nova candidatura de entregador" },
  "staff.upsert": { kind: "administracao", title: "Permissões de administrador alteradas" },
  "staff.activate": { kind: "administracao", title: "Administrador reativado" },
  "staff.deactivate": { kind: "administracao", title: "Acesso de administrador retirado" },
  "setup.owner_created": { kind: "administracao", title: "Conta do proprietário criada" },
  "settings.update": { kind: "administracao", title: "Configurações alteradas" },
  "commission.create": { kind: "administracao", title: "Regra de comissão definida" },
  "payments.provider_update": { kind: "administracao", title: "Método de pagamento alterado" },
  "order.status_change": { kind: "pedidos", title: "Intervenção do admin num pedido" },
  "refund.request": { kind: "pedidos", title: "Reembolso pedido" },
};

const HREF: Record<string, (id: string) => string> = {
  Restaurant: (id) => `/admin/restaurantes/${id}`,
  User: (id) => `/admin/utilizadores/${id}`,
  Order: (id) => `/admin/pedidos/${id}`,
};

function reasonOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "reason" in metadata) {
    const r = (metadata as { reason?: unknown }).reason;
    return typeof r === "string" && r ? `Motivo: ${r}` : null;
  }
  return null;
}

export async function platformActivity(opts: { take?: number; kind?: ActivityKind | null } = {}): Promise<ActivityItem[]> {
  const take = Math.min(opts.take ?? 30, 200);
  const want = (k: ActivityKind) => !opts.kind || opts.kind === k;

  const [audits, users, products, events] = await Promise.all([
    db.auditLog.findMany({
      where: { action: { in: Object.keys(AUDIT).filter((a) => want(AUDIT[a].kind)) } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true, actor: { select: { name: true } } },
    }),
    want("contas")
      ? db.user.findMany({
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, name: true, createdAt: true, isSuperAdmin: true, restaurantMembers: { select: { id: true }, take: 1 }, courier: { select: { id: true } } },
        })
      : [],
    want("produtos")
      ? db.product.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, name: true, createdAt: true, restaurant: { select: { name: true } } } })
      : [],
    want("pedidos")
      ? db.orderStatusEvent.findMany({
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, fromStatus: true, toStatus: true, createdAt: true, actorRole: true, actor: { select: { name: true } }, order: { select: { id: true, code: true, restaurant: { select: { name: true } } } } },
        })
      : [],
  ]);

  const items: ActivityItem[] = [
    ...audits.map((a) => ({
      id: `a-${a.id}`,
      at: a.createdAt,
      kind: AUDIT[a.action].kind,
      title: AUDIT[a.action].title,
      detail: reasonOf(a.metadata),
      actor: a.actor?.name ?? null,
      href: a.entityId && HREF[a.entityType] ? HREF[a.entityType](a.entityId) : null,
    })),
    ...users
      .filter((u) => !u.isSuperAdmin)
      .map((u) => ({
        id: `u-${u.id}`,
        at: u.createdAt,
        kind: "contas" as const,
        title: u.restaurantMembers.length ? "Nova conta de parceiro" : u.courier ? "Nova conta de entregador" : "Novo comprador registado",
        detail: u.name,
        href: `/admin/utilizadores/${u.id}`,
      })),
    ...products.map((p) => ({
      id: `p-${p.id}`,
      at: p.createdAt,
      kind: "produtos" as const,
      title: "Novo produto",
      detail: `${p.name} · ${p.restaurant.name}`,
      href: `/admin/produtos/${p.id}`,
    })),
    ...events.map((e) => ({
      id: `e-${e.id}`,
      at: e.createdAt,
      kind: "pedidos" as const,
      title: e.fromStatus ? `Pedido #${e.order.code} ${ORDER_STATUS_TEXT[e.toStatus]}` : `Novo pedido #${e.order.code}`,
      detail: e.order.restaurant.name,
      actor: e.actor?.name ?? null,
      href: `/admin/pedidos/${e.order.id}`,
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/** Atividade recente de um restaurante (só dados desse restaurante). */
export async function restaurantActivity(restaurantId: string, take = 12): Promise<ActivityItem[]> {
  const [events, products] = await Promise.all([
    db.orderStatusEvent.findMany({
      where: { order: { restaurantId } },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, fromStatus: true, toStatus: true, createdAt: true, order: { select: { code: true } } },
    }),
    db.product.findMany({ where: { restaurantId }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, createdAt: true, updatedAt: true } }),
  ]);
  return [
    ...events.map((e) => ({
      id: `e-${e.id}`,
      at: e.createdAt,
      kind: "pedidos" as const,
      title: e.fromStatus ? `Pedido #${e.order.code} ${ORDER_STATUS_TEXT[e.toStatus]}` : `Novo pedido #${e.order.code}`,
      href: `/parceiro/pedidos`,
    })),
    ...products.map((p) => ({
      id: `p-${p.id}`,
      at: p.updatedAt,
      kind: "produtos" as const,
      title: p.updatedAt.getTime() - p.createdAt.getTime() < 1000 ? "Produto adicionado" : "Produto atualizado",
      detail: p.name,
      href: `/parceiro/cardapio/${p.id}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, take);
}

/** Totais globais para o painel do Super Admin (contagens diretas na base de dados). */
export async function platformTotals() {
  const [
    restaurants, restActive, restPending, restSuspended, users, partners, buyers, productsActive,
    ordersTotal, ordersInProgress, ordersDone, ordersCancelled, gmv,
  ] = await Promise.all([
    db.restaurant.count(),
    db.restaurant.count({ where: { status: "APPROVED", acceptingOrders: true } }),
    db.restaurant.count({ where: { status: "PENDING" } }),
    db.restaurant.count({ where: { status: "SUSPENDED" } }),
    db.user.count({ where: { status: { not: "CLOSED" } } }),
    db.user.count({ where: { status: { not: "CLOSED" }, restaurantMembers: { some: {} } } }),
    db.user.count({ where: { status: { not: "CLOSED" }, isSuperAdmin: false, staff: null, restaurantMembers: { none: {} }, courier: null } }),
    db.product.count({ where: { status: "ACTIVE", restaurant: { status: "APPROVED" } } }),
    db.order.count({ where: { status: { not: "PENDING_PAYMENT" } } }),
    db.order.count({ where: { status: { in: ["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT"] } } }),
    db.order.count({ where: { status: "DELIVERED" } }),
    db.order.count({ where: { status: { in: ["CANCELLED", "REJECTED"] } } }),
    db.order.aggregate({ where: { status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT"] } }, _sum: { totalCents: true } }),
  ]);
  return {
    restaurants, restActive, restPending, restSuspended, users, partners, buyers, productsActive,
    ordersTotal, ordersInProgress, ordersDone, ordersCancelled, gmvCents: gmv._sum.totalCents ?? 0,
  };
}
