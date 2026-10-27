import { z } from "zod";
import { Prisma, type RestaurantRole } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin, assertRestaurantAccess, loadActiveUser } from "../authz";
import { normalizeMzPhone, slugify } from "@/lib/utils";
import { notifyUsers, adminUserIds, restaurantUserIds } from "./notifications";
import { getSettingsUncached } from "./settings";
import { hashPassword, passwordProblems } from "../auth/password";

async function uniqueRestaurantSlug(name: string) {
  const base = slugify(name) || "restaurante";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.restaurant.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const partnerApplicationSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome comercial.").max(120),
  responsibleName: z.string().trim().min(2, "Indique o nome do responsável.").max(120),
  phone: z.string().trim().min(9).max(20),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  cityId: z.string().min(1, "Escolha a cidade."),
  neighborhoodId: z.string().optional().nullable(),
  addressLine: z.string().trim().min(3, "Indique o endereço.").max(200),
  addressReference: z.string().trim().max(300).optional().nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  nuit: z.string().trim().max(20).optional().nullable(),
  businessInfo: z.string().trim().max(2000).optional().nullable(),
  payoutDetails: z.string().trim().max(500).optional().nullable(),
  openingHoursNote: z.string().trim().max(500).optional().nullable(),
});

/** Candidatura de restaurante por um utilizador autenticado. Cria um restaurante PENDENTE. */
export async function applyAsPartner(userId: string, raw: unknown) {
  await loadActiveUser(userId);
  const settings = await getSettingsUncached();
  if (!settings.partnerSignupOpen) throw new AppError("UNAVAILABLE", "As candidaturas de parceiros estão fechadas.");
  const input = partnerApplicationSchema.parse(raw);
  const phone = normalizeMzPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  if (!city || !city.isActive) throw new AppError("VALIDATION", "Cidade inválida.");
  if (input.neighborhoodId) {
    const nb = await db.neighborhood.findUnique({ where: { id: input.neighborhoodId } });
    if (!nb || nb.cityId !== city.id) throw new AppError("VALIDATION", "Bairro inválido.");
  }
  // Submissão repetida (duplo clique, recarregar a página): devolve a candidatura pendente já existente.
  const duplicate = await db.restaurant.findFirst({
    where: { status: "PENDING", name: { equals: input.name, mode: "insensitive" }, members: { some: { userId, role: "OWNER" } } },
  });
  if (duplicate) return duplicate;
  const pendingOwned = await db.restaurantMember.count({ where: { userId, role: "OWNER", restaurant: { status: "PENDING" } } });
  if (pendingOwned >= 3) throw new AppError("CONFLICT", "Já tem candidaturas pendentes. Aguarde a análise.");

  const restaurant = await db.restaurant.create({
    data: {
      slug: await uniqueRestaurantSlug(input.name),
      name: input.name,
      responsibleName: input.responsibleName,
      phone,
      email: input.email,
      cityId: city.id,
      neighborhoodId: input.neighborhoodId || null,
      addressLine: input.addressLine,
      addressReference: input.addressReference || null,
      legalName: input.legalName || null,
      nuit: input.nuit || null,
      businessInfo: [input.businessInfo, input.openingHoursNote ? `Horário indicado: ${input.openingHoursNote}` : null].filter(Boolean).join("\n\n") || null,
      payoutDetails: input.payoutDetails || null,
      status: "PENDING",
      members: { create: { userId, role: "OWNER" } },
    },
  });
  await audit({ actorId: userId, action: "restaurant.apply", entityType: "Restaurant", entityId: restaurant.id });
  await notifyUsers(await adminUserIds(["RESTAURANT_MANAGEMENT"]), {
    type: "RESTAURANT_APPLICATION",
    title: "Nova candidatura de restaurante",
    body: `${restaurant.name} candidatou-se à plataforma.`,
    link: `/admin/restaurantes/${restaurant.id}`,
    email: "order",
  });
  return restaurant;
}

const geo = {
  latitude: z.number().min(-90, "Latitude inválida.").max(90, "Latitude inválida.").nullable().optional(),
  longitude: z.number().min(-180, "Longitude inválida.").max(180, "Longitude inválida.").nullable().optional(),
};

export const adminRestaurantCreateSchema = partnerApplicationSchema.extend({
  description: z.string().trim().max(1000).optional().nullable(),
  acceptingOrders: z.boolean().optional(),
  ...geo,
});

/** Super Admin / gestão de restaurantes: cria diretamente um restaurante e (opcionalmente) a conta do proprietário. */
export async function adminCreateRestaurant(
  adminId: string,
  raw: unknown,
  owner: { mode: "existing"; email: string } | { mode: "new"; name: string; email: string; phone: string; password: string } | { mode: "none" },
) {
  await assertAdmin(adminId, "restaurants.manage");
  const input = adminRestaurantCreateSchema.parse(raw);
  const phone = normalizeMzPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  if (!city) throw new AppError("VALIDATION", "Cidade inválida.");
  if (input.neighborhoodId) {
    const nb = await db.neighborhood.findUnique({ where: { id: input.neighborhoodId } });
    if (!nb || nb.cityId !== city.id) throw new AppError("VALIDATION", "Bairro inválido.");
  }

  let ownerId: string | null = null;
  if (owner.mode === "existing") {
    const u = await db.user.findUnique({ where: { email: owner.email.trim().toLowerCase() } });
    if (!u) throw new AppError("NOT_FOUND", "Não existe utilizador com esse e-mail.");
    ownerId = u.id;
  } else if (owner.mode === "new") {
    const p = passwordProblems(owner.password);
    if (p) throw new AppError("VALIDATION", p);
    const oPhone = normalizeMzPhone(owner.phone);
    if (!oPhone) throw new AppError("VALIDATION", "Telefone do proprietário inválido.");
    try {
      const u = await db.user.create({
        data: { name: owner.name.trim(), email: owner.email.trim().toLowerCase(), phone: oPhone, passwordHash: await hashPassword(owner.password) },
      });
      ownerId = u.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "Já existe uma conta com esse e-mail ou telefone.");
      throw e;
    }
  }
  const restaurant = await db.restaurant.create({
    data: {
      slug: await uniqueRestaurantSlug(input.name),
      name: input.name,
      responsibleName: input.responsibleName,
      phone,
      email: input.email,
      cityId: city.id,
      neighborhoodId: input.neighborhoodId || null,
      addressLine: input.addressLine,
      addressReference: input.addressReference || null,
      legalName: input.legalName || null,
      nuit: input.nuit || null,
      businessInfo: input.businessInfo || null,
      payoutDetails: input.payoutDetails || null,
      description: input.description || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      acceptingOrders: input.acceptingOrders ?? true,
      status: "APPROVED",
      approvedAt: new Date(),
      ...(ownerId ? { members: { create: { userId: ownerId, role: "OWNER" as RestaurantRole } } } : {}),
    },
  });
  await audit({ actorId: adminId, action: "restaurant.admin_create", entityType: "Restaurant", entityId: restaurant.id, metadata: { ownerMode: owner.mode } });
  return restaurant;
}

export async function setRestaurantStatus(
  adminId: string,
  restaurantId: string,
  status: "APPROVED" | "REJECTED" | "SUSPENDED",
  reason?: string | null,
) {
  await assertAdmin(adminId, "restaurants.manage");
  const r = await db.restaurant.findUnique({ where: { id: restaurantId } });
  if (!r) throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
  if ((status === "REJECTED" || status === "SUSPENDED") && !reason?.trim()) throw new AppError("VALIDATION", "Indique o motivo.");
  const allowed: Record<string, string[]> = {
    PENDING: ["APPROVED", "REJECTED"],
    APPROVED: ["SUSPENDED"],
    SUSPENDED: ["APPROVED"],
    REJECTED: ["APPROVED"],
  };
  if (!allowed[r.status].includes(status)) throw new AppError("CONFLICT", "Alteração de estado inválida.");
  await db.restaurant.update({
    where: { id: restaurantId },
    data: { status, statusReason: reason?.trim() || null, ...(status === "APPROVED" && !r.approvedAt ? { approvedAt: new Date() } : {}) },
  });
  await audit({ actorId: adminId, action: `restaurant.${status.toLowerCase()}`, entityType: "Restaurant", entityId: restaurantId, metadata: { reason } });
  const msg = {
    APPROVED: { title: "Restaurante aprovado", body: `${r.name} foi aprovado. Complete o cardápio, horários e zonas de entrega para começar a receber pedidos.` },
    REJECTED: { title: "Candidatura não aprovada", body: `A candidatura de ${r.name} não foi aprovada. Motivo: ${reason}` },
    SUSPENDED: { title: "Restaurante suspenso", body: `${r.name} foi suspenso. Motivo: ${reason}` },
  }[status];
  await notifyUsers(await restaurantUserIds(restaurantId), { type: `RESTAURANT_${status}`, ...msg, link: "/parceiro", email: "account" });
}

export async function adminUpdateRestaurantCommercial(
  adminId: string,
  restaurantId: string,
  input: { allowRestaurantDelivery: boolean; allowPlatformDelivery: boolean; isFeatured: boolean },
) {
  await assertAdmin(adminId, "restaurants.manage");
  if (!input.allowRestaurantDelivery && !input.allowPlatformDelivery) throw new AppError("VALIDATION", "Permita pelo menos um modelo de entrega.");
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  let deliveryMode = r.deliveryMode;
  if (deliveryMode === "PLATFORM" && !input.allowPlatformDelivery) deliveryMode = "RESTAURANT";
  if (deliveryMode === "RESTAURANT" && !input.allowRestaurantDelivery) deliveryMode = "PLATFORM";
  await db.restaurant.update({ where: { id: restaurantId }, data: { ...input, deliveryMode } });
  await audit({ actorId: adminId, action: "restaurant.commercial_update", entityType: "Restaurant", entityId: restaurantId, metadata: input });
}

export const adminRestaurantUpdateSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome comercial.").max(120),
  responsibleName: z.string().trim().min(2, "Indique o nome do responsável.").max(120),
  phone: z.string().trim().min(9, "Telefone inválido.").max(20),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200).optional().nullable().or(z.literal("")),
  description: z.string().trim().max(1000).optional().nullable(),
  cityId: z.string().min(1, "Escolha a cidade."),
  neighborhoodId: z.string().optional().nullable(),
  addressLine: z.string().trim().min(3, "Indique o endereço.").max(200),
  addressReference: z.string().trim().max(300).optional().nullable(),
  legalName: z.string().trim().max(200).optional().nullable(),
  nuit: z.string().trim().max(20).optional().nullable(),
  prepTimeMinutes: z.number().int().min(5).max(240),
  minOrderCents: z.number().int().min(0).max(100_000_00),
  acceptsCashOnDelivery: z.boolean(),
  ...geo,
});

/** Edição completa dos dados de um restaurante pelo Admin (inclui responsável e cidade). */
export async function adminUpdateRestaurant(adminId: string, restaurantId: string, raw: unknown) {
  await assertAdmin(adminId, "restaurants.manage");
  const input = adminRestaurantUpdateSchema.parse(raw);
  const r = await db.restaurant.findUnique({ where: { id: restaurantId } });
  if (!r) throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
  const phone = normalizeMzPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
  const city = await db.city.findUnique({ where: { id: input.cityId } });
  if (!city) throw new AppError("VALIDATION", "Cidade inválida.");
  if (input.neighborhoodId) {
    const nb = await db.neighborhood.findUnique({ where: { id: input.neighborhoodId } });
    if (!nb || nb.cityId !== city.id) throw new AppError("VALIDATION", "Bairro inválido.");
  }
  await db.$transaction(async (tx) => {
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        name: input.name,
        responsibleName: input.responsibleName,
        phone,
        email: input.email || null,
        description: input.description || null,
        cityId: city.id,
        neighborhoodId: input.neighborhoodId || null,
        addressLine: input.addressLine,
        addressReference: input.addressReference || null,
        legalName: input.legalName || null,
        nuit: input.nuit || null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        prepTimeMinutes: input.prepTimeMinutes,
        minOrderCents: input.minOrderCents,
        acceptsCashOnDelivery: input.acceptsCashOnDelivery,
      },
    });
    // As zonas de entrega pertencem a bairros da cidade: ao mudar de cidade deixam de ser válidas.
    if (city.id !== r.cityId) await tx.deliveryZone.deleteMany({ where: { restaurantId } });
  });
  await audit({ actorId: adminId, action: "restaurant.admin_update", entityType: "Restaurant", entityId: restaurantId });
}

/** Pausa ou retoma a receção de pedidos a partir do Admin. */
export async function adminSetAcceptingOrders(adminId: string, restaurantId: string, accepting: boolean) {
  await assertAdmin(adminId, "restaurants.manage");
  const res = await db.restaurant.updateMany({ where: { id: restaurantId }, data: { acceptingOrders: accepting } });
  if (!res.count) throw new AppError("NOT_FOUND", "Restaurante não encontrado.");
  await audit({ actorId: adminId, action: accepting ? "restaurant.resume" : "restaurant.pause", entityType: "Restaurant", entityId: restaurantId });
}

// ─────────────────────────── Gestão da loja (parceiro) ───────────────────────────

export const storeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  phone: z.string().trim().min(9).max(20),
  email: z.string().trim().toLowerCase().email().max(200).optional().nullable().or(z.literal("")),
  neighborhoodId: z.string().optional().nullable(),
  addressLine: z.string().trim().min(3).max(200),
  addressReference: z.string().trim().max(300).optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  prepTimeMinutes: z.number().int().min(5).max(240),
  minOrderCents: z.number().int().min(0).max(100_000_00),
  acceptsCashOnDelivery: z.boolean(),
  deliveryMode: z.enum(["RESTAURANT", "PLATFORM"]),
  cuisineIds: z.array(z.string()).max(5),
});

export async function updateStore(userId: string, restaurantId: string, raw: unknown) {
  await assertRestaurantAccess(userId, restaurantId, "store.manage");
  const input = storeSchema.parse(raw);
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const phone = normalizeMzPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
  if (input.deliveryMode === "PLATFORM" && !r.allowPlatformDelivery) throw new AppError("FORBIDDEN", "A entrega pela plataforma não está autorizada para este restaurante.");
  if (input.deliveryMode === "RESTAURANT" && !r.allowRestaurantDelivery) throw new AppError("FORBIDDEN", "A entrega própria não está autorizada para este restaurante.");
  if (input.neighborhoodId) {
    const nb = await db.neighborhood.findUnique({ where: { id: input.neighborhoodId } });
    if (!nb || nb.cityId !== r.cityId) throw new AppError("VALIDATION", "Bairro inválido.");
  }
  await db.restaurant.update({
    where: { id: restaurantId },
    data: {
      name: input.name,
      description: input.description || null,
      phone,
      email: input.email || null,
      neighborhoodId: input.neighborhoodId || null,
      addressLine: input.addressLine,
      addressReference: input.addressReference || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      prepTimeMinutes: input.prepTimeMinutes,
      minOrderCents: input.minOrderCents,
      acceptsCashOnDelivery: input.acceptsCashOnDelivery,
      deliveryMode: input.deliveryMode,
      cuisines: { set: input.cuisineIds.map((id) => ({ id })) },
    },
  });
  await audit({ actorId: userId, action: "restaurant.store_update", entityType: "Restaurant", entityId: restaurantId });
}

export async function setStoreImage(userId: string, restaurantId: string, kind: "logo" | "cover", fileId: string) {
  await assertRestaurantAccess(userId, restaurantId, "store.manage");
  await db.restaurant.update({ where: { id: restaurantId }, data: kind === "logo" ? { logoFileId: fileId } : { coverFileId: fileId } });
}

export async function setAcceptingOrders(userId: string, restaurantId: string, accepting: boolean) {
  await assertRestaurantAccess(userId, restaurantId, "orders.manage");
  await db.restaurant.update({ where: { id: restaurantId }, data: { acceptingOrders: accepting } });
  await audit({ actorId: userId, action: accepting ? "restaurant.resume" : "restaurant.pause", entityType: "Restaurant", entityId: restaurantId });
}

export async function setPayoutDetails(userId: string, restaurantId: string, details: string) {
  await assertRestaurantAccess(userId, restaurantId, "payout.manage");
  await db.restaurant.update({ where: { id: restaurantId }, data: { payoutDetails: details.trim().slice(0, 500) || null } });
  await audit({ actorId: userId, action: "restaurant.payout_update", entityType: "Restaurant", entityId: restaurantId });
}

export async function setHours(userId: string, restaurantId: string, hours: { dayOfWeek: number; opensAt: number; closesAt: number }[]) {
  await assertRestaurantAccess(userId, restaurantId, "store.manage");
  for (const h of hours) {
    if (!Number.isInteger(h.dayOfWeek) || h.dayOfWeek < 0 || h.dayOfWeek > 6) throw new AppError("VALIDATION", "Dia inválido.");
    if (h.opensAt < 0 || h.opensAt >= 1440 || h.closesAt < 0 || h.closesAt >= 1440 || h.opensAt === h.closesAt)
      throw new AppError("VALIDATION", "Horário inválido.");
  }
  if (hours.length > 21) throw new AppError("VALIDATION", "Demasiados turnos.");
  await db.$transaction([
    db.restaurantHour.deleteMany({ where: { restaurantId } }),
    db.restaurantHour.createMany({ data: hours.map((h) => ({ ...h, restaurantId })) }),
  ]);
}

export async function upsertZone(userId: string, restaurantId: string, input: { neighborhoodId: string; feeCents: number; etaMinutes: number; isActive: boolean }) {
  await assertRestaurantAccess(userId, restaurantId, "store.manage");
  const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const nb = await db.neighborhood.findUnique({ where: { id: input.neighborhoodId } });
  if (!nb || nb.cityId !== r.cityId) throw new AppError("VALIDATION", "O bairro tem de pertencer à cidade do restaurante.");
  if (!Number.isInteger(input.feeCents) || input.feeCents < 0 || input.feeCents > 10_000_00) throw new AppError("VALIDATION", "Taxa de entrega inválida.");
  if (input.etaMinutes < 5 || input.etaMinutes > 240) throw new AppError("VALIDATION", "Tempo estimado inválido.");
  await db.deliveryZone.upsert({
    where: { restaurantId_neighborhoodId: { restaurantId, neighborhoodId: nb.id } },
    create: { restaurantId, neighborhoodId: nb.id, feeCents: input.feeCents, etaMinutes: input.etaMinutes, isActive: input.isActive },
    update: { feeCents: input.feeCents, etaMinutes: input.etaMinutes, isActive: input.isActive },
  });
}

export async function deleteZone(userId: string, restaurantId: string, zoneId: string) {
  await assertRestaurantAccess(userId, restaurantId, "store.manage");
  await db.deliveryZone.deleteMany({ where: { id: zoneId, restaurantId } });
}

/** Lista de verificação para o restaurante poder operar. */
export async function restaurantReadiness(restaurantId: string) {
  const r = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    include: {
      _count: { select: { hours: true, zones: { where: { isActive: true } }, products: { where: { status: "ACTIVE" } } } },
    },
  });
  const items = [
    { key: "approved", label: "Aprovação da plataforma", done: r.status === "APPROVED", href: null },
    { key: "hours", label: "Horário de funcionamento", done: r._count.hours > 0, href: "/parceiro/horarios" },
    { key: "zones", label: "Zonas de entrega", done: r._count.zones > 0, href: "/parceiro/entregas" },
    { key: "products", label: "Pelo menos um produto ativo", done: r._count.products > 0, href: "/parceiro/cardapio" },
    { key: "logo", label: "Logótipo (recomendado)", done: !!r.logoFileId, href: "/parceiro/loja" },
  ];
  return { items, ready: items.filter((i) => i.key !== "logo").every((i) => i.done) };
}

// ─────────────────────────── Funcionários do restaurante ───────────────────────────

export async function addRestaurantMember(
  userId: string,
  restaurantId: string,
  input: { email: string; role: RestaurantRole; name?: string; phone?: string; password?: string },
) {
  await assertRestaurantAccess(userId, restaurantId, "staff.manage");
  if (input.role === "OWNER") {
    const owners = await db.restaurantMember.count({ where: { restaurantId, role: "OWNER" } });
    if (owners >= 3) throw new AppError("VALIDATION", "Limite de proprietários atingido.");
  }
  const email = input.email.trim().toLowerCase();
  let target = await db.user.findUnique({ where: { email } });
  if (!target) {
    if (!input.name || !input.phone || !input.password) throw new AppError("VALIDATION", "Utilizador não encontrado. Preencha nome, telefone e palavra-passe para criar a conta.");
    const p = passwordProblems(input.password);
    if (p) throw new AppError("VALIDATION", p);
    const phone = normalizeMzPhone(input.phone);
    if (!phone) throw new AppError("VALIDATION", "Telefone inválido.");
    try {
      target = await db.user.create({ data: { name: input.name.trim(), email, phone, passwordHash: await hashPassword(input.password) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "Telefone já associado a outra conta.");
      throw e;
    }
  }
  await db.restaurantMember.upsert({
    where: { restaurantId_userId: { restaurantId, userId: target.id } },
    create: { restaurantId, userId: target.id, role: input.role },
    update: { role: input.role, isActive: true },
  });
  await audit({ actorId: userId, action: "restaurant.member_add", entityType: "Restaurant", entityId: restaurantId, metadata: { member: target.id, role: input.role } });
}

export async function updateRestaurantMember(userId: string, restaurantId: string, memberId: string, input: { role?: RestaurantRole; isActive?: boolean; remove?: boolean }) {
  await assertRestaurantAccess(userId, restaurantId, "staff.manage");
  const m = await db.restaurantMember.findUnique({ where: { id: memberId } });
  if (!m || m.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Funcionário não encontrado.");
  if (m.userId === userId) throw new AppError("VALIDATION", "Não pode alterar a sua própria função.");
  if (m.role === "OWNER" && (input.remove || input.isActive === false || (input.role && input.role !== "OWNER"))) {
    const owners = await db.restaurantMember.count({ where: { restaurantId, role: "OWNER", isActive: true } });
    if (owners <= 1) throw new AppError("VALIDATION", "O restaurante tem de manter pelo menos um proprietário.");
  }
  if (input.remove) await db.restaurantMember.delete({ where: { id: memberId } });
  else await db.restaurantMember.update({ where: { id: memberId }, data: { role: input.role, isActive: input.isActive } });
  await audit({ actorId: userId, action: "restaurant.member_update", entityType: "Restaurant", entityId: restaurantId, metadata: { memberId, ...input } });
}

export async function uploadRestaurantDocument(userId: string, restaurantId: string, type: string, fileId: string) {
  await assertRestaurantAccess(userId, restaurantId, "store.manage");
  await db.restaurantDocument.create({ data: { restaurantId, type: type.slice(0, 60), fileId } });
}

/** Admin: associa uma conta existente como proprietária (ex.: o próprio Super Admin para gerir o cardápio). */
export async function adminAddRestaurantOwner(adminId: string, restaurantId: string, email: string) {
  await assertAdmin(adminId, "restaurants.manage");
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status !== "ACTIVE") throw new AppError("NOT_FOUND", "Não existe uma conta ativa com esse e-mail.");
  await db.restaurantMember.upsert({
    where: { restaurantId_userId: { restaurantId, userId: user.id } },
    create: { restaurantId, userId: user.id, role: "OWNER" },
    update: { role: "OWNER", isActive: true },
  });
  await audit({ actorId: adminId, action: "restaurant.owner_assign", entityType: "Restaurant", entityId: restaurantId, metadata: { userId: user.id } });
}
