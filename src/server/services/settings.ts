import { cache } from "react";
import { db } from "../db";

/** Configuração global (linha única). É criada com valores por omissão na primeira leitura. */
export async function getSettingsUncached() {
  const existing = await db.platformSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  try {
    return await db.platformSettings.create({ data: { id: 1 } });
  } catch {
    // Outro pedido criou a linha em simultâneo (primeiro arranque).
    return db.platformSettings.findUniqueOrThrow({ where: { id: 1 } });
  }
}

export const getSettings = cache(getSettingsUncached);

export type Settings = Awaited<ReturnType<typeof getSettingsUncached>>;
