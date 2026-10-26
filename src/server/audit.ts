import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export async function audit(
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
    ip?: string | null;
  },
  tx: Tx = db,
) {
  await tx.auditLog.create({ data: { ...entry, actorId: entry.actorId ?? null } });
}

export async function logError(source: string, error: unknown, context?: Prisma.InputJsonValue) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[${source}]`, err);
  try {
    await db.errorLog.create({
      data: { source, message: err.message.slice(0, 2000), stack: err.stack?.slice(0, 8000), context },
    });
  } catch (e) {
    console.error("[logError] falhou ao registar erro", e);
  }
}
