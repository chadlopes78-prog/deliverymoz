import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { hashPassword, passwordProblems, verifyPassword } from "../auth/password";
import { randomToken, sha256, safeEqual } from "../auth/tokens";
import { normalizeMzPhone } from "@/lib/utils";
import { rateLimit } from "../rate-limit";
import { audit } from "../audit";
import { sendEmail, simpleEmailHtml } from "../email";
import { getSettingsUncached } from "./settings";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Indique o seu nome.").max(100),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  phone: z.string().trim().min(9, "Telefone inválido.").max(20),
  password: z.string().min(1).max(128),
});

/**
 * Cria uma conta de cliente. O registo público nunca atribui funções administrativas,
 * de restaurante ou de entregador (campos extra são ignorados pelo esquema).
 */
export async function registerCustomer(raw: unknown, ip = "unknown") {
  await rateLimit(`register:${ip}`, 10, 3600);
  const input = registerSchema.parse(raw);
  const settings = await getSettingsUncached();
  if (!settings.registrationOpen) throw new AppError("UNAVAILABLE", "O registo está temporariamente fechado.");
  const pwd = passwordProblems(input.password);
  if (pwd) throw new AppError("VALIDATION", pwd);
  const phone = normalizeMzPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION", "Número de telefone moçambicano inválido.");
  try {
    return await db.user.create({
      data: { name: input.name, email: input.email, phone, passwordHash: await hashPassword(input.password) },
      select: { id: true, name: true, email: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("CONFLICT", "Já existe uma conta com este e-mail ou telefone.");
    }
    throw e;
  }
}

// Hash fixo usado quando o utilizador não existe, para que o tempo de resposta não revele contas.
let dummyHash: string | null = null;

export async function authenticate(identifier: string, password: string, ip = "unknown") {
  const id = identifier.trim().toLowerCase();
  await rateLimit(`login:ip:${ip}`, 30, 900);
  await rateLimit(`login:id:${id}`, 8, 900);
  const phone = normalizeMzPhone(id);
  const user = await db.user.findFirst({
    where: id.includes("@") ? { email: id } : phone ? { phone } : { email: id },
  });
  if (!user) {
    dummyHash ??= await hashPassword("dummy-password-for-timing-1");
    await verifyPassword(dummyHash, password);
    throw new AppError("UNAUTHENTICATED", "E-mail/telefone ou palavra-passe incorretos.");
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new AppError("UNAUTHENTICATED", "E-mail/telefone ou palavra-passe incorretos.");
  if (user.status === "SUSPENDED") throw new AppError("FORBIDDEN", "A sua conta está suspensa. Contacte o suporte.");
  if (user.status === "CLOSED") throw new AppError("FORBIDDEN", "Esta conta foi encerrada.");
  return user;
}

export async function requestPasswordReset(email: string, ip = "unknown") {
  await rateLimit(`reset:ip:${ip}`, 10, 3600);
  const normalized = email.trim().toLowerCase();
  await rateLimit(`reset:email:${normalized}`, 3, 3600);
  const user = await db.user.findUnique({ where: { email: normalized } });
  // Resposta idêntica exista ou não a conta.
  if (!user || user.status !== "ACTIVE") return { sent: false };
  const token = randomToken(32);
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
  });
  const settings = await getSettingsUncached();
  const base = settings.siteUrl || process.env.APP_URL || "http://localhost:3000";
  const link = new URL(`/recuperar-password?token=${token}`, base).toString();
  const sent = await sendEmail(
    user.email!,
    `${settings.platformName}: recuperar palavra-passe`,
    simpleEmailHtml(
      "Recuperar palavra-passe",
      "Recebemos um pedido para redefinir a sua palavra-passe. O link é válido durante 1 hora. Se não fez este pedido, ignore este e-mail.",
      { url: link, label: "Definir nova palavra-passe" },
    ),
  );
  return { sent, token: process.env.NODE_ENV === "test" ? token : undefined };
}

export async function resetPassword(token: string, newPassword: string) {
  const pwd = passwordProblems(newPassword);
  if (pwd) throw new AppError("VALIDATION", pwd);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("VALIDATION", "O link de recuperação é inválido ou expirou.");
  }
  const claimed = await db.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError("VALIDATION", "O link de recuperação já foi utilizado.");
  await db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await db.session.deleteMany({ where: { userId: record.userId } });
  await audit({ actorId: record.userId, action: "user.password_reset", entityType: "User", entityId: record.userId });
  return record.userId;
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw new AppError("VALIDATION", "A palavra-passe atual está incorreta.");
  const pwd = passwordProblems(next);
  if (pwd) throw new AppError("VALIDATION", pwd);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await audit({ actorId: userId, action: "user.password_change", entityType: "User", entityId: userId });
}

export async function updateProfile(userId: string, raw: { name: string; phone: string; email: string }) {
  const name = raw.name.trim();
  if (name.length < 2) throw new AppError("VALIDATION", "Indique o seu nome.");
  const phone = normalizeMzPhone(raw.phone);
  if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
  const email = z.string().trim().toLowerCase().email().safeParse(raw.email);
  if (!email.success) throw new AppError("VALIDATION", "E-mail inválido.");
  try {
    await db.user.update({ where: { id: userId }, data: { name, phone, email: email.data } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new AppError("CONFLICT", "Este e-mail ou telefone já está associado a outra conta.");
    throw e;
  }
}

/**
 * Encerramento de conta: anonimiza dados pessoais, mantendo pedidos (obrigações fiscais/contabilísticas).
 */
export async function closeAccount(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { restaurantMembers: true } });
  if (user.isSuperAdmin) throw new AppError("FORBIDDEN", "A conta do proprietário não pode ser encerrada por aqui.");
  if (!(await verifyPassword(user.passwordHash, password))) throw new AppError("VALIDATION", "Palavra-passe incorreta.");
  const active = await db.order.count({ where: { customerId: userId, status: { in: ["PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT"] } } });
  if (active) throw new AppError("CONFLICT", "Tem pedidos em curso. Aguarde a sua conclusão antes de encerrar a conta.");
  await db.$transaction([
    db.address.deleteMany({ where: { userId } }),
    db.favorite.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.cart.deleteMany({ where: { userId } }),
    db.restaurantMember.deleteMany({ where: { userId } }),
    db.user.update({
      where: { id: userId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        name: "Conta encerrada",
        email: null,
        phone: null,
        passwordHash: await hashPassword(randomToken(24)),
      },
    }),
  ]);
  await audit({ actorId: userId, action: "user.close_account", entityType: "User", entityId: userId });
}

// ─────────────────────────── Configuração inicial do proprietário ───────────────────────────

export async function ownerExists() {
  return (await db.user.count({ where: { isSuperAdmin: true } })) > 0;
}

/**
 * Cria a conta do proprietário (Super Admin). Só funciona enquanto não existir nenhum Super Admin
 * e exige o SETUP_TOKEN definido nas variáveis de ambiente do servidor.
 */
export async function createOwner(raw: { setupToken: string; name: string; email: string; phone: string; password: string }, ip = "unknown") {
  await rateLimit(`setup:${ip}`, 10, 3600);
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 16) {
    throw new AppError("UNAVAILABLE", "Defina a variável SETUP_TOKEN (mínimo 16 caracteres) no servidor para criar a conta do proprietário.");
  }
  if (!safeEqual(raw.setupToken, expected)) throw new AppError("FORBIDDEN", "Código de configuração inválido.");
  const input = registerSchema.parse(raw);
  const pwd = passwordProblems(input.password);
  if (pwd) throw new AppError("VALIDATION", pwd);
  if (input.password.length < 12) throw new AppError("VALIDATION", "A palavra-passe do proprietário deve ter pelo menos 12 caracteres.");
  const phone = normalizeMzPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");

  return db.$transaction(
    async (tx) => {
      // Bloqueio consultivo para impedir duas criações em simultâneo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
      if ((await tx.user.count({ where: { isSuperAdmin: true } })) > 0) {
        throw new AppError("CONFLICT", "A conta do proprietário já foi criada.");
      }
      const existing = await tx.user.findFirst({ where: { OR: [{ email: input.email }, { phone }] } });
      const passwordHash = await hashPassword(input.password);
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true, name: input.name, passwordHash, status: "ACTIVE" } })
        : await tx.user.create({ data: { name: input.name, email: input.email, phone, passwordHash, isSuperAdmin: true } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "setup.owner_created", entityType: "User", entityId: user.id, ip } });
      return user;
    },
    { timeout: 15_000 },
  );
}
