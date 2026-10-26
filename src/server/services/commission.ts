import { db, type Tx } from "../db";
import { getSettingsUncached } from "./settings";

/** Regra de comissão aplicável num instante: regra do restaurante > regra global > valor por omissão. */
export async function resolveCommission(restaurantId: string, at: Date = new Date(), tx: Tx = db) {
  const specific = await tx.commissionRule.findFirst({
    where: { restaurantId, effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (specific) return { bps: specific.percentageBps, fixedCents: specific.fixedCents, source: "RESTAURANT" as const };
  const global = await tx.commissionRule.findFirst({
    where: { restaurantId: null, effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (global) return { bps: global.percentageBps, fixedCents: global.fixedCents, source: "GLOBAL" as const };
  const s = await getSettingsUncached();
  return { bps: s.defaultCommissionBps, fixedCents: 0, source: "DEFAULT" as const };
}
