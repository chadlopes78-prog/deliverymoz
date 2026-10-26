import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";

export const LOCATION_COOKIE = "dm_loc";

export type CustomerLocation = { cityId: string; cityName: string; neighborhoodId: string | null; neighborhoodName: string | null } | null;

/** Localização escolhida pelo cliente (cidade/bairro), validada contra a base de dados. */
export async function getCustomerLocation(): Promise<CustomerLocation> {
  const raw = (await cookies()).get(LOCATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { c, n } = JSON.parse(raw) as { c?: string; n?: string };
    if (!c) return null;
    const city = await db.city.findUnique({ where: { id: c } });
    if (!city || !city.isActive) return null;
    const nb = n ? await db.neighborhood.findUnique({ where: { id: n } }) : null;
    const validNb = nb && nb.cityId === city.id && nb.isActive ? nb : null;
    return { cityId: city.id, cityName: city.name, neighborhoodId: validNb?.id ?? null, neighborhoodName: validNb?.name ?? null };
  } catch {
    return null;
  }
}

export async function getGeography() {
  return db.city.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, neighborhoods: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
}
export type Geography = Awaited<ReturnType<typeof getGeography>>;
