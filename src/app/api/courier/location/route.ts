import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { updateCourierLocation } from "@/server/services/deliveries";
import { isAppError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";

/** Recebe a localização do entregador durante uma entrega ativa (com verificação de origem contra CSRF). */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: "origem inválida" }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  try {
    await rateLimit(`loc:${user.id}`, 30, 60);
    const body = (await req.json()) as { lat?: number; lng?: number };
    await updateCourierLocation(user.id, Number(body.lat), Number(body.lng));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isAppError(e)) return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "erro" }, { status: 500 });
  }
}
