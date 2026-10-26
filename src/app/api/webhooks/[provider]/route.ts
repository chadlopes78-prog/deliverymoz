import { NextResponse } from "next/server";
import type { PaymentProviderKey } from "@prisma/client";
import { processWebhook } from "@/server/services/payments";
import { isAppError } from "@/server/errors";
import { logError } from "@/server/audit";

const MAP: Record<string, PaymentProviderKey> = { mpesa: "MPESA", emola: "EMOLA", card: "CARD", test: "TEST" };

/**
 * Recetor genérico de webhooks de pagamento. A assinatura é validada pelo adaptador do fornecedor
 * e os eventos repetidos são ignorados de forma idempotente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const key = MAP[(await params).provider];
  if (!key) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const r = await processWebhook(key, raw, req.headers);
    return NextResponse.json({ ok: true, duplicate: r.duplicate });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 401 : 404 });
    await logError("webhook", e, { provider: key });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
