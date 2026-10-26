import { z } from "zod";
import { db } from "../db";
import { AppError } from "../errors";
import { assertRestaurantAccess } from "../authz";
import { slugify } from "@/lib/utils";

export async function saveMenuCategory(userId: string, restaurantId: string, input: { id?: string | null; name: string; description?: string | null; position?: number; isActive?: boolean }) {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new AppError("VALIDATION", "Nome da categoria inválido.");
  if (input.id) {
    const c = await db.menuCategory.findUnique({ where: { id: input.id } });
    if (!c || c.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Categoria não encontrada.");
    return db.menuCategory.update({
      where: { id: c.id },
      data: { name, description: input.description?.trim() || null, position: input.position ?? c.position, isActive: input.isActive ?? c.isActive },
    });
  }
  const count = await db.menuCategory.count({ where: { restaurantId } });
  if (count >= 100) throw new AppError("VALIDATION", "Limite de categorias atingido.");
  return db.menuCategory.create({ data: { restaurantId, name, description: input.description?.trim() || null, position: input.position ?? count } });
}

export async function deleteMenuCategory(userId: string, restaurantId: string, id: string) {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const c = await db.menuCategory.findUnique({ where: { id } });
  if (!c || c.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Categoria não encontrada.");
  // Os produtos ficam sem categoria (onDelete: SetNull) e não são apagados.
  await db.menuCategory.delete({ where: { id } });
}

export async function moveMenuCategory(userId: string, restaurantId: string, id: string, dir: -1 | 1) {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const cats = await db.menuCategory.findMany({ where: { restaurantId }, orderBy: [{ position: "asc" }, { name: "asc" }] });
  const i = cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  await db.$transaction(cats.map((c, idx) => db.menuCategory.update({ where: { id: c.id }, data: { position: idx } })));
}

const optionSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: z.number().int().min(0).max(10_000_00),
  isAvailable: z.boolean().default(true),
});
const groupSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().trim().min(1).max(80),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z.array(optionSchema).min(1, "Cada grupo precisa de pelo menos uma opção.").max(40),
  })
  .refine((g) => g.maxSelect >= g.minSelect, "O máximo tem de ser maior ou igual ao mínimo.")
  .refine((g) => g.minSelect <= g.options.length, "O mínimo não pode exceder o número de opções.");

export const productSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome do produto.").max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  priceCents: z.number().int().min(0, "Preço inválido.").max(10_000_000),
  categoryId: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PAUSED"]),
  isFeatured: z.boolean().default(false),
  availableFrom: z.number().int().min(0).max(1439).nullable().optional(),
  availableUntil: z.number().int().min(0).max(1439).nullable().optional(),
  optionGroups: z.array(groupSchema).max(15).default([]),
});

async function uniqueProductSlug(restaurantId: string, name: string, exceptId?: string) {
  const base = slugify(name) || "produto";
  for (let i = 0; i < 100; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const ex = await db.product.findUnique({ where: { restaurantId_slug: { restaurantId, slug } }, select: { id: true } });
    if (!ex || ex.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Cria ou edita um produto, incluindo variantes/complementos. O restaurantId vem do contexto verificado. */
export async function saveProduct(userId: string, restaurantId: string, productId: string | null, raw: unknown, imageFileId?: string | null) {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const input = productSchema.parse(raw);
  if ((input.availableFrom == null) !== (input.availableUntil == null)) throw new AppError("VALIDATION", "Indique o início e o fim do horário de disponibilidade.");
  if (input.categoryId) {
    const c = await db.menuCategory.findUnique({ where: { id: input.categoryId } });
    if (!c || c.restaurantId !== restaurantId) throw new AppError("VALIDATION", "Categoria inválida.");
  }
  let existing = null;
  if (productId) {
    existing = await db.product.findUnique({ where: { id: productId } });
    if (!existing || existing.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Produto não encontrado.");
  }
  const data = {
    name: input.name,
    description: input.description || null,
    priceCents: input.priceCents,
    categoryId: input.categoryId || null,
    status: input.status,
    isFeatured: input.isFeatured,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? null,
    ...(imageFileId !== undefined ? { imageFileId } : {}),
  };
  return db.$transaction(async (tx) => {
    const product = existing
      ? await tx.product.update({
          where: { id: existing.id },
          data: { ...data, slug: existing.name === input.name ? existing.slug : await uniqueProductSlug(restaurantId, input.name, existing.id) },
        })
      : await tx.product.create({
          data: {
            ...data,
            restaurantId,
            slug: await uniqueProductSlug(restaurantId, input.name),
            position: await tx.product.count({ where: { restaurantId } }),
          },
        });
    // Substitui as opções. Pedidos antigos guardam um instantâneo das opções, por isso o histórico não é afetado.
    await tx.optionGroup.deleteMany({ where: { productId: product.id } });
    for (const [gi, g] of input.optionGroups.entries()) {
      await tx.optionGroup.create({
        data: {
          productId: product.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          position: gi,
          options: { create: g.options.map((o, oi) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents, isAvailable: o.isAvailable, position: oi })) },
        },
      });
    }
    return product;
  });
}

export async function setProductStatus(userId: string, restaurantId: string, productId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const res = await db.product.updateMany({ where: { id: productId, restaurantId }, data: { status } });
  if (res.count !== 1) throw new AppError("NOT_FOUND", "Produto não encontrado.");
}

/** Elimina definitivamente apenas produtos sem pedidos; caso contrário arquiva para preservar o histórico. */
export async function deleteProduct(userId: string, restaurantId: string, productId: string) {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const p = await db.product.findUnique({ where: { id: productId }, include: { _count: { select: { orderItems: true } } } });
  if (!p || p.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Produto não encontrado.");
  if (p._count.orderItems > 0) {
    await db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    return { archived: true };
  }
  await db.product.delete({ where: { id: p.id } });
  return { archived: false };
}

export async function setOptionAvailability(userId: string, restaurantId: string, optionId: string, isAvailable: boolean) {
  await assertRestaurantAccess(userId, restaurantId, "menu.manage");
  const o = await db.option.findUnique({ where: { id: optionId }, include: { group: { include: { product: true } } } });
  if (!o || o.group.product.restaurantId !== restaurantId) throw new AppError("NOT_FOUND", "Opção não encontrada.");
  await db.option.update({ where: { id: optionId }, data: { isAvailable } });
}
