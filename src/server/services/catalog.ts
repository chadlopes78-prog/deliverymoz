import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getSettings } from "./settings";
import { PUBLIC_RESTAURANT_WHERE, restaurantAvailability } from "./availability";

export type CatalogFilters = {
  cityId?: string | null;
  neighborhoodId?: string | null;
  q?: string | null;
  cuisine?: string | null;
  sort?: "relevance" | "rating" | "fee" | "eta" | null;
  openOnly?: boolean;
  promoOnly?: boolean;
  maxFeeCents?: number | null;
  minRating?: number | null;
  featuredOnly?: boolean;
  favoritesOf?: string | null;
  take?: number;
};

/** Restaurantes visíveis publicamente (aprovados e com configuração completa), com dados reais de entrega. */
export async function listRestaurants(f: CatalogFilters) {
  const settings = await getSettings();
  const now = new Date();
  const where: Prisma.RestaurantWhereInput = {
    ...PUBLIC_RESTAURANT_WHERE,
    ...(f.cityId ? { cityId: f.cityId } : {}),
    ...(f.neighborhoodId ? { zones: { some: { neighborhoodId: f.neighborhoodId, isActive: true } } } : {}),
    ...(f.cuisine ? { cuisines: { some: { slug: f.cuisine } } } : {}),
    ...(f.featuredOnly ? { isFeatured: true } : {}),
    ...(f.minRating ? { ratingAvg: { gte: f.minRating }, ratingCount: { gt: 0 } } : {}),
    ...(f.favoritesOf ? { favorites: { some: { userId: f.favoritesOf } } } : {}),
    ...(f.q
      ? {
          OR: [
            { name: { contains: f.q, mode: "insensitive" } },
            { description: { contains: f.q, mode: "insensitive" } },
            { cuisines: { some: { name: { contains: f.q, mode: "insensitive" } } } },
            { products: { some: { status: "ACTIVE", name: { contains: f.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const rows = await db.restaurant.findMany({
    where,
    take: 200,
    orderBy: [{ isFeatured: "desc" }, { ratingAvg: "desc" }, { name: "asc" }],
    select: {
      id: true, slug: true, name: true, description: true, logoFileId: true, coverFileId: true, ratingAvg: true, ratingCount: true,
      status: true, acceptingOrders: true, prepTimeMinutes: true, minOrderCents: true, isFeatured: true, cityId: true,
      hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
      zones: { where: { isActive: true }, select: { neighborhoodId: true, feeCents: true, etaMinutes: true } },
      cuisines: { select: { name: true, slug: true } },
      coupons: { where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true }, take: 1 },
    },
  });
  let list = rows.map((r) => {
    const zone = f.neighborhoodId ? r.zones.find((z) => z.neighborhoodId === f.neighborhoodId) : null;
    const fees = r.zones.map((z) => z.feeCents);
    const deliveryFeeCents = zone ? zone.feeCents : fees.length ? Math.min(...fees) : null;
    const etas = r.zones.map((z) => z.etaMinutes);
    const eta = (zone?.etaMinutes ?? (etas.length ? Math.min(...etas) : 30)) + r.prepTimeMinutes;
    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description, logoFileId: r.logoFileId, coverFileId: r.coverFileId,
      ratingAvg: r.ratingAvg, ratingCount: r.ratingCount, isFeatured: r.isFeatured, minOrderCents: r.minOrderCents,
      cuisines: r.cuisines, availability: restaurantAvailability(r, settings.timezone, now),
      deliveryFeeCents, feeIsFrom: !zone, etaMinutes: eta, hasPromo: r.coupons.length > 0,
    };
  });
  if (f.openOnly) list = list.filter((r) => r.availability.orderable);
  if (f.promoOnly) list = list.filter((r) => r.hasPromo);
  if (f.maxFeeCents != null) list = list.filter((r) => r.deliveryFeeCents != null && r.deliveryFeeCents <= f.maxFeeCents!);
  if (f.sort === "rating") list.sort((a, b) => b.ratingAvg - a.ratingAvg);
  if (f.sort === "fee") list.sort((a, b) => (a.deliveryFeeCents ?? 1e12) - (b.deliveryFeeCents ?? 1e12));
  if (f.sort === "eta") list.sort((a, b) => a.etaMinutes - b.etaMinutes);
  // Abertos primeiro
  list.sort((a, b) => Number(b.availability.orderable) - Number(a.availability.orderable));
  return list.slice(0, f.take ?? 60);
}
export type RestaurantListItem = Awaited<ReturnType<typeof listRestaurants>>[number];

export async function searchProducts(q: string, cityId?: string | null, take = 24) {
  if (!q.trim()) return [];
  return db.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }],
      restaurant: { ...PUBLIC_RESTAURANT_WHERE, ...(cityId ? { cityId } : {}) },
    },
    take,
    select: { id: true, slug: true, name: true, description: true, priceCents: true, imageFileId: true, restaurant: { select: { slug: true, name: true } } },
  });
}

export async function activeBanners(cityId?: string | null) {
  const now = new Date();
  return db.banner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        { OR: [{ cityId: null }, ...(cityId ? [{ cityId }] : [])] },
      ],
    },
    orderBy: { position: "asc" },
    take: 6,
  });
}

/** Categorias de cozinha que têm pelo menos um restaurante público. */
export async function cuisinesWithRestaurants(cityId?: string | null) {
  return db.cuisineCategory.findMany({
    where: { isActive: true, restaurants: { some: { ...PUBLIC_RESTAURANT_WHERE, ...(cityId ? { cityId } : {}) } } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

/** Pratos disponíveis dos restaurantes já publicados (a lista de restaurantes vem filtrada por localização e publicação). */
export async function availableProducts(restaurantIds: string[], take = 12) {
  if (!restaurantIds.length) return [];
  return db.product.findMany({
    where: { restaurantId: { in: restaurantIds }, status: "ACTIVE" },
    orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
    take,
    select: { id: true, slug: true, name: true, description: true, priceCents: true, imageFileId: true, restaurant: { select: { slug: true, name: true } } },
  });
}

/** Restaurantes onde o comprador já encomendou (para "Peça de novo"), só entre os publicados. */
export async function reorderRestaurantIds(userId: string) {
  const rows = await db.order.findMany({
    where: { customerId: userId, status: "DELIVERED" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { restaurantId: true },
  });
  return Array.from(new Set(rows.map((r) => r.restaurantId)));
}
