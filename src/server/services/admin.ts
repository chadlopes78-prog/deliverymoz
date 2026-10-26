import { z } from "zod";
import { Prisma, type PaymentProviderKey, type StaffRole } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin } from "../authz";
import { hashPassword, passwordProblems } from "../auth/password";
import { normalizeMzPhone, slugify } from "@/lib/utils";
import { getProvider } from "../payments/registry";
import { notifyUsers } from "./notifications";

// ─────────────────────────── Utilizadores ───────────────────────────

export async function setUserStatus(adminId: string, userId: string, status: "ACTIVE" | "SUSPENDED", reason?: string | null) {
  const admin = await assertAdmin(adminId, "customers.manage");
  if (adminId === userId) throw new AppError("VALIDATION", "Não pode alterar o estado da sua própria conta.");
  const user = await db.user.findUnique({ where: { id: userId }, include: { staff: true } });
  if (!user) throw new AppError("NOT_FOUND", "Utilizador não encontrado.");
  if (user.status === "CLOSED") throw new AppError("CONFLICT", "A conta foi encerrada.");
  if ((user.isSuperAdmin || user.staff) && !admin.isSuperAdmin) throw new AppError("FORBIDDEN", "Apenas o Super Admin pode alterar contas administrativas.");
  if (user.isSuperAdmin) throw new AppError("FORBIDDEN", "A conta do proprietário não pode ser suspensa.");
  if (status === "SUSPENDED" && !reason?.trim()) throw new AppError("VALIDATION", "Indique o motivo.");
  await db.user.update({ where: { id: userId }, data: { status, suspendedReason: status === "SUSPENDED" ? reason!.trim() : null } });
  if (status === "SUSPENDED") await db.session.deleteMany({ where: { userId } });
  await audit({ actorId: adminId, action: status === "SUSPENDED" ? "user.suspend" : "user.reactivate", entityType: "User", entityId: userId, metadata: { reason } });
}

// ─────────────────────────── Funcionários administrativos ───────────────────────────

/** Apenas o Super Admin cria/gere funcionários. Nunca é possível criar outro Super Admin por esta via. */
export async function upsertStaff(
  adminId: string,
  input: { email: string; role: StaffRole; name?: string; phone?: string; password?: string },
) {
  await assertAdmin(adminId, "staff.manage");
  const email = input.email.trim().toLowerCase();
  let user = await db.user.findUnique({ where: { email } });
  if (!user) {
    if (!input.name || !input.phone || !input.password) throw new AppError("VALIDATION", "Utilizador não encontrado. Indique nome, telefone e palavra-passe para criar a conta.");
    const p = passwordProblems(input.password);
    if (p) throw new AppError("VALIDATION", p);
    const phone = normalizeMzPhone(input.phone);
    if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
    try {
      user = await db.user.create({ data: { name: input.name.trim(), email, phone, passwordHash: await hashPassword(input.password) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "Telefone já associado a outra conta.");
      throw e;
    }
  }
  if (user.isSuperAdmin) throw new AppError("VALIDATION", "Este utilizador já é Super Admin.");
  await db.staffMember.upsert({ where: { userId: user.id }, create: { userId: user.id, role: input.role }, update: { role: input.role, isActive: true } });
  await audit({ actorId: adminId, action: "staff.upsert", entityType: "User", entityId: user.id, metadata: { role: input.role } });
}

export async function setStaffActive(adminId: string, staffId: string, isActive: boolean) {
  await assertAdmin(adminId, "staff.manage");
  const s = await db.staffMember.update({ where: { id: staffId }, data: { isActive } });
  if (!isActive) await db.session.deleteMany({ where: { userId: s.userId } });
  await audit({ actorId: adminId, action: isActive ? "staff.activate" : "staff.deactivate", entityType: "StaffMember", entityId: staffId });
}

// ─────────────────────────── Configurações ───────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB).");
export const settingsSchema = z.object({
  platformName: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120).nullable().optional(),
  primaryColor: hex,
  accentColor: hex,
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Código de moeda ISO 4217 (ex.: MZN)."),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  locale: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(3).max(60),
  supportEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
  supportPhone: z.string().trim().max(30).nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  companyLegalName: z.string().trim().max(200).nullable().optional(),
  companyAddress: z.string().trim().max(300).nullable().optional(),
  siteUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  serviceFeeBps: z.number().int().min(0).max(5000),
  serviceFeeFixedCents: z.number().int().min(0).max(1_000_000),
  serviceFeeMaxCents: z.number().int().min(0).max(10_000_000).nullable(),
  defaultCommissionBps: z.number().int().min(0).max(10000),
  courierFeeShareBps: z.number().int().min(0).max(10000),
  courierBaseFeeCents: z.number().int().min(0).max(1_000_000),
  deliveryOfferTimeoutSec: z.number().int().min(20).max(900),
  paymentTimeoutMinutes: z.number().int().min(5).max(240),
  customerCancelWindow: z.enum(["BEFORE_ACCEPT", "NEVER"]),
  cancellationPolicy: z.string().max(5000).nullable().optional(),
  termsContent: z.string().max(100_000).nullable().optional(),
  privacyContent: z.string().max(100_000).nullable().optional(),
  registrationOpen: z.boolean(),
  partnerSignupOpen: z.boolean(),
  courierSignupOpen: z.boolean(),
  emailNotificationsOn: z.boolean(),
});

export async function updateSettings(adminId: string, raw: Partial<z.infer<typeof settingsSchema>>) {
  await assertAdmin(adminId, "settings.manage");
  const input = settingsSchema.partial().parse(raw);
  try {
    if (input.timezone) new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    if (input.currency) new Intl.NumberFormat("en", { style: "currency", currency: input.currency });
  } catch {
    throw new AppError("VALIDATION", "Fuso horário ou moeda inválidos.");
  }
  const data = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "" ? null : v]));
  await db.platformSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  await audit({ actorId: adminId, action: "settings.update", entityType: "PlatformSettings", entityId: "1", metadata: { fields: Object.keys(data) } });
}

export async function setPlatformLogo(adminId: string, fileId: string | null) {
  await assertAdmin(adminId, "settings.manage");
  await db.platformSettings.update({ where: { id: 1 }, data: { logoFileId: fileId } });
}

export async function completeSetup(adminId: string) {
  await assertAdmin(adminId, "settings.manage");
  await db.platformSettings.update({ where: { id: 1 }, data: { setupCompletedAt: new Date() } });
  await audit({ actorId: adminId, action: "setup.complete", entityType: "PlatformSettings", entityId: "1" });
}

// ─────────────────────────── Geografia e categorias ───────────────────────────

export async function saveCity(adminId: string, input: { id?: string | null; name: string; isActive: boolean; countryCode?: string }) {
  await assertAdmin(adminId, "settings.manage");
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("VALIDATION", "Nome da cidade inválido.");
  try {
    if (input.id) return await db.city.update({ where: { id: input.id }, data: { name, isActive: input.isActive } });
    const countryCode = input.countryCode ?? "MZ";
    return await db.city.create({ data: { name, slug: `${slugify(name)}-${countryCode.toLowerCase()}`, isActive: input.isActive, countryCode } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "Esta cidade já existe.");
    throw e;
  }
}

export async function addNeighborhoods(adminId: string, cityId: string, names: string[]) {
  await assertAdmin(adminId, "settings.manage");
  const clean = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2 && n.length <= 80))];
  if (!clean.length) throw new AppError("VALIDATION", "Indique pelo menos um bairro.");
  await db.neighborhood.createMany({ data: clean.map((name) => ({ cityId, name })), skipDuplicates: true });
}

export async function setNeighborhoodActive(adminId: string, id: string, isActive: boolean) {
  await assertAdmin(adminId, "settings.manage");
  await db.neighborhood.update({ where: { id }, data: { isActive } });
}

export async function saveCuisine(adminId: string, input: { id?: string | null; name: string; emoji?: string | null; isActive: boolean; position?: number }) {
  await assertAdmin(adminId, "settings.manage");
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("VALIDATION", "Nome inválido.");
  try {
    if (input.id) return await db.cuisineCategory.update({ where: { id: input.id }, data: { name, emoji: input.emoji || null, isActive: input.isActive, position: input.position } });
    return await db.cuisineCategory.create({ data: { name, slug: slugify(name), emoji: input.emoji || null, isActive: input.isActive, position: input.position ?? 0 } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "Já existe uma categoria com este nome.");
    throw e;
  }
}

// ─────────────────────────── Pagamentos ───────────────────────────

export async function providerStatusList() {
  const configs = await db.paymentProviderConfig.findMany();
  const keys: PaymentProviderKey[] = ["MPESA", "EMOLA", "CARD", "CASH_ON_DELIVERY"];
  return keys.map((key) => {
    const provider = getProvider(key)!;
    const config = configs.find((c) => c.key === key);
    const missing = provider.missingConfig();
    return {
      key,
      displayName: config?.displayName ?? provider.defaultName,
      enabled: !!config?.enabled && missing.length === 0,
      storedEnabled: !!config?.enabled,
      mode: config?.mode ?? "SANDBOX",
      instructions: config?.instructions ?? null,
      configured: missing.length === 0,
      missing,
      note: provider.integrationNote,
      kind: provider.kind,
    };
  });
}

export async function updateProviderConfig(
  adminId: string,
  key: PaymentProviderKey,
  input: { enabled: boolean; displayName?: string; instructions?: string | null; mode?: "SANDBOX" | "LIVE" },
) {
  await assertAdmin(adminId, "settings.manage");
  const provider = getProvider(key);
  if (!provider) throw new AppError("NOT_FOUND", "Fornecedor desconhecido.");
  if (input.enabled && provider.missingConfig().length) {
    throw new AppError("VALIDATION", `Não é possível ativar: falta configurar ${provider.missingConfig().join(", ")}.`);
  }
  await db.paymentProviderConfig.upsert({
    where: { key },
    create: { key, enabled: input.enabled, displayName: input.displayName?.trim() || provider.defaultName, instructions: input.instructions || null, mode: input.mode ?? "SANDBOX" },
    update: { enabled: input.enabled, displayName: input.displayName?.trim() || undefined, instructions: input.instructions ?? undefined, mode: input.mode },
  });
  await audit({ actorId: adminId, action: "payments.provider_update", entityType: "PaymentProviderConfig", entityId: key, metadata: { enabled: input.enabled, mode: input.mode } });
}

// ─────────────────────────── Comissões ───────────────────────────

export async function createCommissionRule(
  adminId: string,
  input: { restaurantId?: string | null; percentageBps: number; fixedCents: number; effectiveFrom: Date; note?: string | null },
) {
  await assertAdmin(adminId, "commissions.manage");
  if (!Number.isInteger(input.percentageBps) || input.percentageBps < 0 || input.percentageBps > 10000) throw new AppError("VALIDATION", "Percentagem inválida.");
  if (!Number.isInteger(input.fixedCents) || input.fixedCents < 0) throw new AppError("VALIDATION", "Valor fixo inválido.");
  if (Number.isNaN(input.effectiveFrom.getTime())) throw new AppError("VALIDATION", "Data inválida.");
  if (input.restaurantId) {
    const r = await db.restaurant.findUnique({ where: { id: input.restaurantId } });
    if (!r) throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
  }
  const rule = await db.commissionRule.create({
    data: { restaurantId: input.restaurantId || null, percentageBps: input.percentageBps, fixedCents: input.fixedCents, effectiveFrom: input.effectiveFrom, note: input.note || null, createdById: adminId },
  });
  await audit({ actorId: adminId, action: "commission.create", entityType: "CommissionRule", entityId: rule.id, metadata: { ...input, effectiveFrom: input.effectiveFrom.toISOString() } });
  return rule;
}

// ─────────────────────────── Entregadores ───────────────────────────

export async function setCourierStatus(adminId: string, courierId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED", reason?: string | null) {
  await assertAdmin(adminId, "couriers.manage");
  const c = await db.courier.findUnique({ where: { id: courierId } });
  if (!c) throw new AppError("NOT_FOUND", "Entregador não encontrado.");
  if (status !== "APPROVED" && !reason?.trim()) throw new AppError("VALIDATION", "Indique o motivo.");
  const allowed: Record<string, string[]> = { PENDING: ["APPROVED", "REJECTED"], APPROVED: ["SUSPENDED"], SUSPENDED: ["APPROVED"], REJECTED: ["APPROVED"] };
  if (!allowed[c.status].includes(status)) throw new AppError("CONFLICT", "Alteração de estado inválida.");
  if (status === "SUSPENDED") {
    const active = await db.delivery.count({ where: { courierId, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } } });
    if (active) throw new AppError("CONFLICT", "O entregador tem entregas em curso. Reatribua-as antes de suspender.");
  }
  await db.courier.update({
    where: { id: courierId },
    data: { status, statusReason: reason?.trim() || null, isAvailable: status === "APPROVED" ? c.isAvailable : false, ...(status === "APPROVED" && !c.approvedAt ? { approvedAt: new Date() } : {}) },
  });
  if (status !== "APPROVED") await db.deliveryOffer.updateMany({ where: { courierId, status: "OFFERED" }, data: { status: "CANCELLED" } });
  await audit({ actorId: adminId, action: `courier.${status.toLowerCase()}`, entityType: "Courier", entityId: courierId, metadata: { reason } });
  const msg = {
    APPROVED: { title: "Conta de entregador aprovada", body: "Já pode ficar disponível e receber ofertas de entrega." },
    REJECTED: { title: "Candidatura não aprovada", body: `Motivo: ${reason}` },
    SUSPENDED: { title: "Conta de entregador suspensa", body: `Motivo: ${reason}` },
  }[status];
  await notifyUsers([c.userId], { type: `COURIER_${status}`, ...msg, link: "/entregador", email: "account" });
}
