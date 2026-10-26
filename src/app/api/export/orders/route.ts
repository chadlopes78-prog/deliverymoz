import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/server/auth/session";
import { hasAdminPermission, hasRestaurantPermission } from "@/server/permissions";
import { ordersCsv, parseRange } from "@/server/services/finance";
import { PARTNER_COOKIE } from "@/server/guards";

/** Exportação CSV de pedidos: admin (finance.view) ou restaurante (finance.view, apenas a própria loja). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401 });
  const url = new URL(req.url);
  const range = parseRange({ de: url.searchParams.get("de") ?? undefined, ate: url.searchParams.get("ate") ?? undefined, periodo: url.searchParams.get("periodo") ?? undefined });
  let restaurantId: string | undefined;
  if (url.searchParams.get("escopo") === "parceiro") {
    const rid = (await cookies()).get(PARTNER_COOKIE)?.value;
    const m = user.restaurantMembers.find((x) => x.restaurantId === rid) ?? user.restaurantMembers[0];
    if (!m || !hasRestaurantPermission(m.role, "finance.view")) return new NextResponse("Sem permissão", { status: 403 });
    restaurantId = m.restaurantId;
  } else if (!hasAdminPermission(user, "finance.view")) {
    return new NextResponse("Sem permissão", { status: 403 });
  }
  const csv = await ordersCsv(range, restaurantId);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
