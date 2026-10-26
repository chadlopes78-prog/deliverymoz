import { NextResponse } from "next/server";
import { safeEqual } from "@/server/auth/tokens";
import { reconcilePayments } from "@/server/services/payments";
import { redispatchStale } from "@/server/services/deliveries";
import { db } from "@/server/db";
import { logError } from "@/server/audit";

export const maxDuration = 300;

/**
 * Tarefa periódica (Vercel Cron, ver vercel.json): reconcilia pagamentos, expira pedidos não pagos,
 * reenvia ofertas de entrega e limpa sessões/limites expirados. Protegida por CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const payments = await reconcilePayments();
    const deliveries = await redispatchStale();
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86400_000) } } });
    await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
    return NextResponse.json({ ok: true, payments, deliveries, sessionsRemoved: sessions.count });
  } catch (e) {
    await logError("cron.maintenance", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
