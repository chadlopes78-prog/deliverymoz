"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { OrderStatus, RestaurantRole } from "@prisma/client";
import { requirePartner, requireUser, PARTNER_COOKIE } from "@/server/guards";
import { runAction, str, optStr, bool, int, file, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { parseMoneyToCents } from "@/lib/money";
import { zonedToUtc } from "@/lib/hours";
import { destroySession } from "@/server/auth/session";
import { db } from "@/server/db";
import { transitionOrder } from "@/server/services/orders";
import { saveMenuCategory, deleteMenuCategory, moveMenuCategory, saveProduct, setProductStatus, deleteProduct } from "@/server/services/menu";
import {
  updateStore, setStoreImage, setAcceptingOrders, setPayoutDetails, setHours, upsertZone, deleteZone,
  addRestaurantMember, updateRestaurantMember, uploadRestaurantDocument, applyAsPartner,
} from "@/server/services/restaurants";
import { saveCoupon, setCouponActive } from "@/server/services/marketing";
import { replyToReview } from "@/server/services/customer";
import { storePublicImage, storePrivateDocument } from "@/server/storage/files";
import { getSettingsUncached } from "@/server/services/settings";
import { productInputFromForm, hoursFromForm } from "@/server/forms";

export async function partnerLogoutAction() {
  await destroySession();
  redirect("/entrar");
}

/** Troca o restaurante ativo; o servidor confirma que o utilizador pertence a esse restaurante. */
export async function switchRestaurantAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser("/parceiro");
  const id = str(fd, "restaurantId");
  if (!user.restaurantMembers.some((m) => m.restaurantId === id)) return { ok: false, error: "Sem acesso a este restaurante." };
  (await cookies()).set(PARTNER_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/parceiro");
}

export async function applyPartnerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser("/parceiro/registo");
  const r = await runAction(async () => {
    const restaurant = await applyAsPartner(user.id, {
      name: str(fd, "name"), responsibleName: str(fd, "responsibleName"), phone: str(fd, "phone"), email: str(fd, "email"),
      cityId: str(fd, "cityId"), neighborhoodId: optStr(fd, "neighborhoodId"), addressLine: str(fd, "addressLine"), addressReference: optStr(fd, "addressReference"),
      legalName: optStr(fd, "legalName"), nuit: optStr(fd, "nuit"), businessInfo: optStr(fd, "businessInfo"), payoutDetails: optStr(fd, "payoutDetails"), openingHoursNote: optStr(fd, "openingHoursNote"),
    });
    for (const [key, type] of [["docLicense", "Alvará / licença"], ["docNuit", "Certidão NUIT"], ["docOther", "Outro documento"]] as const) {
      const f = file(fd, key);
      if (f) {
        const stored = await storePrivateDocument(user.id, f, "restaurant_document");
        await db.restaurantDocument.create({ data: { restaurantId: restaurant.id, type, fileId: stored.id } });
      }
    }
    (await cookies()).set(PARTNER_COOKIE, restaurant.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  });
  if (r?.ok) redirect("/parceiro?candidatura=1");
  return r;
}

// ─────────────── Pedidos ───────────────

export async function orderTransitionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("orders.manage");
  return runAction(async () => {
    const order = await db.order.findUnique({ where: { id: str(fd, "id") }, select: { restaurantId: true } });
    if (!order || order.restaurantId !== ctx.restaurantId) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
    await transitionOrder({ role: "RESTAURANT", userId: ctx.user.id }, str(fd, "id"), str(fd, "to") as OrderStatus, {
      reason: optStr(fd, "reason"),
      prepTimeMinutes: int(fd, "prepTimeMinutes", 30),
      cashCollected: bool(fd, "cashCollected"),
    });
    revalidatePath("/parceiro", "layout");
  });
}

export async function pauseStoreAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("orders.manage");
  return runAction(async () => {
    await setAcceptingOrders(ctx.user.id, ctx.restaurantId, bool(fd, "accepting"));
    revalidatePath("/parceiro", "layout");
  }, "Estado da loja atualizado.");
}

// ─────────────── Cardápio ───────────────

export async function categoryAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("menu.manage");
  return runAction(async () => {
    await saveMenuCategory(ctx.user.id, ctx.restaurantId, { id: optStr(fd, "id"), name: str(fd, "name"), description: optStr(fd, "description"), isActive: fd.has("isActive") ? bool(fd, "isActive") : true });
    revalidatePath("/parceiro", "layout");
  }, "Categoria guardada.");
}

export async function categoryDeleteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("menu.manage");
  return runAction(async () => {
    await deleteMenuCategory(ctx.user.id, ctx.restaurantId, str(fd, "id"));
    revalidatePath("/parceiro", "layout");
  }, "Categoria eliminada. Os produtos ficaram sem categoria.");
}

export async function categoryMoveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("menu.manage");
  return runAction(async () => {
    await moveMenuCategory(ctx.user.id, ctx.restaurantId, str(fd, "id"), str(fd, "dir") === "up" ? -1 : 1);
    revalidatePath("/parceiro", "layout");
  });
}

export async function productAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("menu.manage");
  let createdId: string | null = null;
  const productId = optStr(fd, "id");
  const r = await runAction(async () => {
    const input = productInputFromForm(fd);
    const img = file(fd, "image");
    const stored = img ? await storePublicImage(ctx.user.id, img, "product_image", 1200) : null;
    const p = await saveProduct(ctx.user.id, ctx.restaurantId, productId, input, stored ? stored.id : bool(fd, "removeImage") ? null : undefined);
    createdId = p.id;
    revalidatePath("/parceiro", "layout");
  }, "Produto guardado.");
  if (r?.ok && !productId && createdId) redirect(`/parceiro/cardapio?guardado=${createdId}`);
  return r;
}

export async function productStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("menu.manage");
  return runAction(async () => {
    await setProductStatus(ctx.user.id, ctx.restaurantId, str(fd, "id"), str(fd, "status") as "ACTIVE");
    revalidatePath("/parceiro", "layout");
  });
}

export async function productDeleteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("menu.manage");
  return runAction(async () => {
    const r = await deleteProduct(ctx.user.id, ctx.restaurantId, str(fd, "id"));
    revalidatePath("/parceiro", "layout");
    return { ok: true, message: r.archived ? "O produto tem pedidos associados e foi arquivado (o histórico mantém-se)." : "Produto eliminado." };
  });
}

// ─────────────── Loja ───────────────

export async function storeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("store.manage");
  return runAction(async () => {
    const lat = optStr(fd, "latitude");
    const lng = optStr(fd, "longitude");
    await updateStore(ctx.user.id, ctx.restaurantId, {
      name: str(fd, "name"), description: optStr(fd, "description"), phone: str(fd, "phone"), email: optStr(fd, "email") ?? "",
      neighborhoodId: optStr(fd, "neighborhoodId"), addressLine: str(fd, "addressLine"), addressReference: optStr(fd, "addressReference"),
      latitude: lat ? Number(lat) : null, longitude: lng ? Number(lng) : null,
      prepTimeMinutes: int(fd, "prepTimeMinutes", 30), minOrderCents: parseMoneyToCents(str(fd, "minOrder")) ?? 0,
      acceptsCashOnDelivery: bool(fd, "acceptsCashOnDelivery"), deliveryMode: str(fd, "deliveryMode") as "RESTAURANT",
      cuisineIds: fd.getAll("cuisineIds").map(String),
    });
    const logo = file(fd, "logo");
    if (logo) await setStoreImage(ctx.user.id, ctx.restaurantId, "logo", (await storePublicImage(ctx.user.id, logo, "restaurant_logo", 512)).id);
    const cover = file(fd, "cover");
    if (cover) await setStoreImage(ctx.user.id, ctx.restaurantId, "cover", (await storePublicImage(ctx.user.id, cover, "restaurant_cover", 1600)).id);
    revalidatePath("/parceiro", "layout");
  }, "Loja atualizada.");
}

export async function payoutAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("payout.manage");
  return runAction(async () => {
    await setPayoutDetails(ctx.user.id, ctx.restaurantId, str(fd, "payoutDetails"));
    revalidatePath("/parceiro/configuracoes");
  }, "Dados de liquidação guardados.");
}

export async function documentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("store.manage");
  return runAction(async () => {
    const f = file(fd, "document");
    if (!f) throw new AppError("VALIDATION", "Escolha um ficheiro.");
    const stored = await storePrivateDocument(ctx.user.id, f, "restaurant_document");
    await uploadRestaurantDocument(ctx.user.id, ctx.restaurantId, str(fd, "type") || "Documento", stored.id);
    revalidatePath("/parceiro/loja");
  }, "Documento enviado.");
}

export async function hoursAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("store.manage");
  return runAction(async () => {
    const hours = hoursFromForm(fd);
    await setHours(ctx.user.id, ctx.restaurantId, hours);
    revalidatePath("/parceiro", "layout");
  }, "Horário guardado.");
}

export async function zoneAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("store.manage");
  return runAction(async () => {
    const fee = parseMoneyToCents(str(fd, "fee"));
    if (fee == null) throw new AppError("VALIDATION", "Indique a taxa de entrega (0 para grátis).");
    await upsertZone(ctx.user.id, ctx.restaurantId, { neighborhoodId: str(fd, "neighborhoodId"), feeCents: fee, etaMinutes: int(fd, "etaMinutes", 30), isActive: fd.has("isActive") ? bool(fd, "isActive") : true });
    revalidatePath("/parceiro", "layout");
  }, "Zona de entrega guardada.");
}

export async function zoneDeleteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("store.manage");
  return runAction(async () => {
    await deleteZone(ctx.user.id, ctx.restaurantId, str(fd, "id"));
    revalidatePath("/parceiro", "layout");
  }, "Zona removida.");
}

// ─────────────── Equipa, promoções, avaliações ───────────────

export async function memberAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("staff.manage");
  return runAction(async () => {
    await addRestaurantMember(ctx.user.id, ctx.restaurantId, { email: str(fd, "email"), role: str(fd, "role") as RestaurantRole, name: optStr(fd, "name") ?? undefined, phone: optStr(fd, "phone") ?? undefined, password: optStr(fd, "password") ?? undefined });
    revalidatePath("/parceiro/funcionarios");
  }, "Funcionário adicionado.");
}

export async function memberUpdateAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("staff.manage");
  return runAction(async () => {
    await updateRestaurantMember(ctx.user.id, ctx.restaurantId, str(fd, "id"), {
      role: (optStr(fd, "role") as RestaurantRole) ?? undefined,
      isActive: fd.has("isActive") ? bool(fd, "isActive") : undefined,
      remove: bool(fd, "remove"),
    });
    revalidatePath("/parceiro/funcionarios");
  }, "Funcionário atualizado.");
}

export async function partnerCouponAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("promotions.manage");
  return runAction(async () => {
    const tz = (await getSettingsUncached()).timezone;
    const type = str(fd, "type") as "PERCENT" | "FIXED";
    const v = str(fd, "value").replace(",", ".");
    const value = type === "PERCENT" ? Math.round(Number(v) * 100) : parseMoneyToCents(v);
    if (!value || value <= 0) throw new AppError("VALIDATION", "Valor inválido.");
    const d = (k: string) => (str(fd, k) ? zonedToUtc(str(fd, k), tz) : null);
    await saveCoupon({ kind: "restaurant", userId: ctx.user.id, restaurantId: ctx.restaurantId }, optStr(fd, "id"), {
      code: str(fd, "code"), description: optStr(fd, "description"), type, value,
      maxDiscountCents: parseMoneyToCents(str(fd, "maxDiscount")), minSubtotalCents: parseMoneyToCents(str(fd, "minSubtotal")) ?? 0,
      startsAt: d("startsAt"), endsAt: d("endsAt"),
      usageLimitTotal: str(fd, "usageLimitTotal") ? int(fd, "usageLimitTotal") : null,
      usageLimitPerUser: str(fd, "usageLimitPerUser") ? int(fd, "usageLimitPerUser") : null,
      firstOrderOnly: bool(fd, "firstOrderOnly"), isActive: bool(fd, "isActive"),
    });
    revalidatePath("/parceiro/promocoes");
  }, "Promoção guardada.");
}

export async function partnerCouponToggleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("promotions.manage");
  return runAction(async () => {
    await setCouponActive({ kind: "restaurant", userId: ctx.user.id, restaurantId: ctx.restaurantId }, str(fd, "id"), bool(fd, "isActive"));
    revalidatePath("/parceiro/promocoes");
  });
}

export async function reviewReplyAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requirePartner("reviews.reply");
  return runAction(async () => {
    await replyToReview(ctx.user.id, ctx.restaurantId, str(fd, "id"), str(fd, "reply"));
    revalidatePath("/parceiro/avaliacoes");
  }, "Resposta publicada.");
}
