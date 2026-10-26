import { cache } from "react";
import { db } from "../db";

/** Configuração global (linha única). É criada com valores por omissão na primeira leitura. */
export async function getSettingsUncached() {
  const existing = await db.platformSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return db.platformSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export const getSettings = cache(getSettingsUncached);

export type Settings = Awaited<ReturnType<typeof getSettingsUncached>>;
