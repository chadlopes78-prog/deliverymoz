/**
 * Dados sintéticos criados APENAS na base de dados de testes, limpa antes de cada teste.
 */
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let seq = 0;
const fastHash = hashPassword("Password123");

export async function makeUser(over: Partial<{ name: string; email: string; isSuperAdmin: boolean; status: "ACTIVE" | "SUSPENDED" }> = {}) {
  seq++;
  return db.user.create({
    data: {
      name: over.name ?? `Teste ${seq}`,
      email: over.email ?? `teste${seq}-${Date.now()}@example.test`,
      phone: `25884${String(1000000 + seq).slice(-7)}`,
      passwordHash: await fastHash,
      isSuperAdmin: over.isSuperAdmin ?? false,
      status: over.status ?? "ACTIVE",
    },
  });
}

export async function makeGeo() {
  const city = await db.city.create({ data: { name: `Cidade ${++seq}`, slug: `cidade-${seq}` } });
  const nb = await db.neighborhood.create({ data: { cityId: city.id, name: "Bairro A" } });
  const nb2 = await db.neighborhood.create({ data: { cityId: city.id, name: "Bairro B" } });
  return { city, nb, nb2 };
}

/** Restaurante aprovado, aberto 24h, com zona de entrega e um produto com opções. */
export async function makeRestaurant(opts: { cityId: string; neighborhoodId: string; ownerId: string; deliveryMode?: "RESTAURANT" | "PLATFORM" }) {
  const r = await db.restaurant.create({
    data: {
      slug: `r-${++seq}`,
      name: `Restaurante Teste ${seq}`,
      responsibleName: "Resp",
      phone: "258840000000",
      cityId: opts.cityId,
      addressLine: "Rua X",
      status: "APPROVED",
      deliveryMode: opts.deliveryMode ?? "RESTAURANT",
      allowPlatformDelivery: true,
      allowRestaurantDelivery: true,
      members: { create: { userId: opts.ownerId, role: "OWNER" } },
      hours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: 0, closesAt: 1439 })) },
      zones: { create: { neighborhoodId: opts.neighborhoodId, feeCents: 5000, etaMinutes: 30 } },
    },
  });
  const product = await db.product.create({
    data: {
      restaurantId: r.id,
      slug: `p-${seq}`,
      name: "Produto Teste",
      priceCents: 30000,
      optionGroups: {
        create: [
          { name: "Tamanho", minSelect: 1, maxSelect: 1, options: { create: [{ name: "Normal", priceDeltaCents: 0 }, { name: "Grande", priceDeltaCents: 5000 }] } },
          { name: "Extras", minSelect: 0, maxSelect: 2, options: { create: [{ name: "Queijo", priceDeltaCents: 2000 }] } },
        ],
      },
    },
    include: { optionGroups: { include: { options: true }, orderBy: { position: "asc" } } },
  });
  return { restaurant: r, product };
}

export async function enableProvider(key: "CASH_ON_DELIVERY" | "TEST" | "MPESA", enabled = true) {
  await db.paymentProviderConfig.upsert({ where: { key }, create: { key, enabled, displayName: key }, update: { enabled } });
}
