import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { audit } from "../audit";
import { assertAdmin, assertRestaurantAccess } from "../authz";

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Código: 3 a 30 letras, números, - ou _."),
  description: z.string().trim().max(300).nullable().optional(),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().positive("Valor inválido."),
  maxDiscountCents: z.number().int().positive().nullable().optional(),
  minSubtotalCents: z.number().int().min(0).default(0),
  startsAt: z.date().nullable().optional(),
  endsAt: z.date().nullable().optional(),
  usageLimitTotal: z.number().int().positive().nullable().optional(),
  usageLimitPerUser: z.number().int().positive().nullable().optional(),
  firstOrderOnly: z.boolean().default(false),
  cityId: z.string().nullable().optional(),
  restaurantIds: z.array(z.string()).max(200).default([]),
  campaignId: z.string().nullable().optional(),
  fundedBy: z.enum(["PLATFORM", "RESTAURANT"]).default("PLATFORM"),
  isActive: z.boolean().default(true),
});

export type CouponActor = { kind: "admin"; userId: string } | { kind: "restaurant"; userId: string; restaurantId: string };

/** Cupões da plataforma (admin) ou do próprio restaurante (sempre limitados a esse restaurante e financiados por ele). */
export async function saveCoupon(actor: CouponActor, couponId: string | null, raw: unknown) {
  const input = couponSchema.parse(raw);
  if (input.type === "PERCENT" && input.value > 10000) throw new AppError("VALIDATION", "A percentagem não pode exceder 100%.");
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new AppError("VALIDATION", "A data de fim tem de ser posterior ao início.");
  if (actor.kind === "admin") {
    await assertAdmin(actor.userId, "marketing.manage");
  } else {
    await assertRestaurantAccess(actor.userId, actor.restaurantId, "promotions.manage");
    input.restaurantIds = [actor.restaurantId];
    input.fundedBy = "RESTAURANT";
    input.cityId = null;
    input.campaignId = null;
  }
  if (couponId) {
    const existing = await db.coupon.findUnique({ where: { id: couponId }, include: { restaurants: true } });
    if (!existing) throw new AppError("NOT_FOUND", "Cupão não encontrado.");
    if (actor.kind === "restaurant" && !(existing.restaurants.length === 1 && existing.restaurants[0].id === actor.restaurantId && existing.fundedBy === "RESTAURANT")) {
      throw new AppError("FORBIDDEN", "Este cupão não pertence ao seu restaurante.");
    }
  }
  const { restaurantIds, ...rest } = input;
  const data = {
    ...rest,
    description: rest.description || null,
    cityId: rest.cityId || null,
    campaignId: rest.campaignId || null,
    restaurants: { set: restaurantIds.map((id) => ({ id })) },
  };
  try {
    const coupon = couponId
      ? await db.coupon.update({ where: { id: couponId }, data })
      : await db.coupon.create({ data: { ...data, restaurants: { connect: restaurantIds.map((id) => ({ id })) } } });
    await audit({ actorId: actor.userId, action: couponId ? "coupon.update" : "coupon.create", entityType: "Coupon", entityId: coupon.id, metadata: { code: coupon.code } });
    return coupon;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("CONFLICT", "Já existe um cupão com este código.");
    throw e;
  }
}

export async function setCouponActive(actor: CouponActor, couponId: string, isActive: boolean) {
  const existing = await db.coupon.findUnique({ where: { id: couponId }, include: { restaurants: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Cupão não encontrado.");
  if (actor.kind === "admin") await assertAdmin(actor.userId, "marketing.manage");
  else {
    await assertRestaurantAccess(actor.userId, actor.restaurantId, "promotions.manage");
    if (!(existing.restaurants.length === 1 && existing.restaurants[0].id === actor.restaurantId && existing.fundedBy === "RESTAURANT"))
      throw new AppError("FORBIDDEN", "Este cupão não pertence ao seu restaurante.");
  }
  await db.coupon.update({ where: { id: couponId }, data: { isActive } });
}

export async function saveCampaign(adminId: string, id: string | null, input: { name: string; description?: string | null; cityId?: string | null; restaurantId?: string | null; startsAt?: Date | null; endsAt?: Date | null; isActive: boolean }) {
  await assertAdmin(adminId, "marketing.manage");
  if (input.name.trim().length < 2) throw new AppError("VALIDATION", "Indique o nome da campanha.");
  const data = { ...input, name: input.name.trim(), description: input.description || null, cityId: input.cityId || null, restaurantId: input.restaurantId || null };
  const c = id ? await db.campaign.update({ where: { id }, data }) : await db.campaign.create({ data });
  await audit({ actorId: adminId, action: id ? "campaign.update" : "campaign.create", entityType: "Campaign", entityId: c.id });
  return c;
}

/** Resultados reais de uma campanha: pedidos não cancelados que usaram cupões da campanha. */
export async function campaignResults(campaignId: string) {
  const agg = await db.order.aggregate({
    where: { coupon: { campaignId }, status: { notIn: ["CANCELLED", "REJECTED", "PENDING_PAYMENT"] } },
    _count: true,
    _sum: { totalCents: true, discountCents: true },
  });
  return { orders: agg._count, grossCents: agg._sum.totalCents ?? 0, discountCents: agg._sum.discountCents ?? 0 };
}

export async function saveBanner(adminId: string, id: string | null, input: { title: string; subtitle?: string | null; linkUrl?: string | null; cityId?: string | null; position: number; isActive: boolean; startsAt?: Date | null; endsAt?: Date | null; imageFileId?: string | null }) {
  await assertAdmin(adminId, "marketing.manage");
  if (input.title.trim().length < 2) throw new AppError("VALIDATION", "Indique o título.");
  if (input.linkUrl && !/^\/[^/]/.test(input.linkUrl) && !/^https:\/\//.test(input.linkUrl)) throw new AppError("VALIDATION", "Link inválido (use um caminho interno /... ou https://).");
  const data = { ...input, title: input.title.trim(), subtitle: input.subtitle || null, linkUrl: input.linkUrl || null, cityId: input.cityId || null };
  if (input.imageFileId === undefined) delete (data as { imageFileId?: unknown }).imageFileId;
  const b = id ? await db.banner.update({ where: { id }, data }) : await db.banner.create({ data });
  await audit({ actorId: adminId, action: id ? "banner.update" : "banner.create", entityType: "Banner", entityId: b.id });
  return b;
}

export async function deleteBanner(adminId: string, id: string) {
  await assertAdmin(adminId, "marketing.manage");
  await db.banner.delete({ where: { id } });
  await audit({ actorId: adminId, action: "banner.delete", entityType: "Banner", entityId: id });
}
