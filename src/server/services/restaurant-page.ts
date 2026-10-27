import { cache } from "react";
import { db } from "../db";
import { getSettings } from "./settings";
import { restaurantAvailability } from "./availability";
import { isWithinWindow } from "@/lib/hours";
import { fileUrl } from "../storage/files";
import type { MenuCategoryView, MenuProduct } from "@/components/public/menu-view";

/** Dados públicos de um restaurante aprovado. Restaurantes não aprovados não são expostos. */
export const getPublicRestaurant = cache(async (slug: string) => {
  const r = await db.restaurant.findUnique({
    where: { slug },
    include: {
      city: true,
      neighborhood: true,
      hours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }] },
      zones: { where: { isActive: true }, include: { neighborhood: true }, orderBy: { feeCents: "asc" } },
      cuisines: true,
      menuCategories: { where: { isActive: true }, orderBy: [{ position: "asc" }, { name: "asc" }] },
      products: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: { optionGroups: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } },
      },
    },
  });
  if (!r || r.status !== "APPROVED" || !r.isListed) return null;
  const settings = await getSettings();
  const now = new Date();
  const toView = (p: (typeof r.products)[number]): MenuProduct => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    imageUrl: fileUrl(p.imageFileId),
    available: p.status === "ACTIVE" && isWithinWindow(p.availableFrom, p.availableUntil, now, settings.timezone),
    featured: p.isFeatured,
    groups: p.optionGroups.map((g) => ({ id: g.id, name: g.name, min: g.minSelect, max: g.maxSelect, options: g.options.map((o) => ({ id: o.id, name: o.name, deltaCents: o.priceDeltaCents, available: o.isAvailable })) })),
  });
  const categories: MenuCategoryView[] = r.menuCategories
    .map((c) => ({ id: c.id, name: c.name, description: c.description, products: r.products.filter((p) => p.categoryId === c.id).map(toView) }))
    .filter((c) => c.products.length);
  const uncategorized = r.products.filter((p) => !p.categoryId || !r.menuCategories.some((c) => c.id === p.categoryId));
  if (uncategorized.length) categories.push({ id: "outros", name: categories.length ? "Outros" : "Cardápio", description: null, products: uncategorized.map(toView) });
  return { restaurant: r, categories, availability: restaurantAvailability(r, settings.timezone, now), settings };
});
