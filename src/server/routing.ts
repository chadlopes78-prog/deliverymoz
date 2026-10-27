import "server-only";
import { db } from "./db";
import { needsOwnerActivation } from "./services/accounts";

export type LoginIntent = "comprador" | "parceiro";

/** Só aceita caminhos internos (evita redirecionamentos para outros domínios). */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/**
 * Destino depois de iniciar sessão, decidido no servidor a partir das funções guardadas na base de dados
 * (nunca do e-mail ou de parâmetros enviados pelo navegador):
 * 0. a conta indicada em OWNER_EMAIL, enquanto não houver proprietário, vai para a ativação do painel;
 * 1. um destino explícito (ex.: voltar ao checkout) é respeitado;
 * 2. Super Admin e administradores ativos vão para o centro de controlo, qualquer que seja a opção escolhida;
 * 3. parceiros vão para o painel do restaurante (ou para o registo, se ainda não tiverem restaurante);
 * 4. compradores vão para a área de compras.
 */
export async function destinationAfterLogin(userId: string, intent: LoginIntent, rawNext?: string | null) {
  const next = safeNext(rawNext);
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, isSuperAdmin: true, staff: { select: { isActive: true } }, restaurantMembers: { where: { isActive: true }, select: { id: true }, take: 1 } },
  });
  if (!u) return "/";
  // A conta indicada em OWNER_EMAIL ainda não foi ativada como proprietária: vai para a ativação, não para as compras.
  if (await needsOwnerActivation(u)) return "/admin/login";
  if (next !== "/") return next;
  if (u.isSuperAdmin || u.staff?.isActive) return "/admin";
  if (intent === "parceiro") return u.restaurantMembers.length ? "/parceiro" : "/parceiro/registo";
  return "/";
}
