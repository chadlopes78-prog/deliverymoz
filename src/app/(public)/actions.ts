"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { runAction, str, optStr, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { getSessionUser, createSession, destroySession } from "@/server/auth/session";
import { requestInfo } from "@/server/request";
import { authenticate, registerCustomer, requestPasswordReset, resetPassword, needsOwnerActivation } from "@/server/services/accounts";
import { mergeAnonymousCart, addToCart, updateCartItem, clearCart, setCartCoupon } from "@/server/services/cart";
import { getCartRef, CART_COOKIE } from "@/server/cart-ref";
import { sha256 } from "@/server/auth/tokens";
import { LOCATION_COOKIE } from "@/server/location";
import { db } from "@/server/db";
import { placeOrder, transitionOrder } from "@/server/services/orders";
import { startPayment, customerRefreshPayment } from "@/server/services/payments";
import { toggleFavorite, createReview } from "@/server/services/customer";
import { createTicket, replyTicket } from "@/server/services/support";
import { destinationAfterLogin, safeNext, type LoginIntent } from "@/server/routing";


async function afterLogin(userId: string) {
  await createSession(userId);
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (token) {
    await mergeAnonymousCart(sha256(token), userId);
    jar.delete(CART_COOKIE);
  }
}

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let target = "/";
  const intent: LoginIntent = str(fd, "intent") === "parceiro" ? "parceiro" : "comprador";
  const result = await runAction(async () => {
    const { ip } = await requestInfo();
    const user = await authenticate(str(fd, "identifier"), String(fd.get("password") ?? ""), ip);
    await afterLogin(user.id);
    target = await destinationAfterLogin(user.id, intent, optStr(fd, "next"));
  });
  if (result?.ok) redirect(target);
  return result;
}

export async function registerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let registered: { email: string | null } | null = null;
  const result = await runAction(async () => {
    if (fd.get("accept") !== "on") throw new AppError("VALIDATION", "Aceite os termos e a política de privacidade.");
    const { ip } = await requestInfo();
    const user = await registerCustomer({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone"), password: String(fd.get("password") ?? "") }, ip);
    await afterLogin(user.id);
    registered = user;
  });
  if (result?.ok) {
    const r = registered as { email: string | null } | null;
    if (r && (await needsOwnerActivation({ email: r.email, isSuperAdmin: false }))) redirect("/admin/login");
    redirect(str(fd, "intent") === "parceiro" ? "/parceiro/registo" : safeNext(optStr(fd, "next")));
  }
  return result;
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function forgotPasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { ip } = await requestInfo();
    await requestPasswordReset(str(fd, "email"), ip);
    return { ok: true, message: "Se existir uma conta com este e-mail, enviámos as instruções de recuperação." };
  });
}

export async function resetPasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    const pw = String(fd.get("password") ?? "");
    if (pw !== String(fd.get("confirm") ?? "")) throw new AppError("VALIDATION", "As palavras-passe não coincidem.");
    const userId = await resetPassword(str(fd, "token"), pw);
    await createSession(userId);
  });
  if (result?.ok) redirect("/minha-conta?senha=1");
  return result;
}

export async function setLocationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const cityId = str(fd, "cityId");
    const neighborhoodId = optStr(fd, "neighborhoodId");
    const city = await db.city.findUnique({ where: { id: cityId } });
    if (!city || !city.isActive) throw new AppError("VALIDATION", "Escolha uma cidade.");
    if (neighborhoodId) {
      const nb = await db.neighborhood.findUnique({ where: { id: neighborhoodId } });
      if (!nb || nb.cityId !== city.id) throw new AppError("VALIDATION", "Bairro inválido.");
    }
    (await cookies()).set(LOCATION_COOKIE, JSON.stringify({ c: cityId, n: neighborhoodId }), { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, httpOnly: true, secure: process.env.NODE_ENV === "production" });
    revalidatePath("/", "layout");
  }, "Localização atualizada.");
}

export async function addToCartAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ref = await getCartRef(true);
    const r = await addToCart(ref, {
      productId: str(fd, "productId"),
      quantity: Math.max(1, Math.min(50, Number(str(fd, "quantity")) || 1)),
      optionIds: fd.getAll("optionId").map(String),
      notes: optStr(fd, "notes"),
      replace: fd.get("replace") === "1",
    });
    if (!r.ok) return { ok: false, error: "CONFLICT", data: { conflict: r.conflict.currentRestaurantName } };
    revalidatePath("/", "layout");
    return { ok: true, message: "Adicionado à sacola.", data: { count: r.count } };
  });
}

export async function updateCartItemAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateCartItem(await getCartRef(), str(fd, "itemId"), Number(str(fd, "quantity")));
    revalidatePath("/", "layout");
  });
}

export async function clearCartAction(_: ActionResult): Promise<ActionResult> {
  return runAction(async () => {
    await clearCart(await getCartRef());
    revalidatePath("/", "layout");
  }, "Sacola esvaziada.");
}

export async function couponAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const code = optStr(fd, "code");
    await setCartCoupon(await getCartRef(true), code);
    revalidatePath("/sacola");
    revalidatePath("/checkout");
  });
}

export async function placeOrderAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/checkout");
  let code: string | null = null;
  let online = false;
  const result = await runAction(async () => {
    const addressId = optStr(fd, "addressId");
    const lat = Number(str(fd, "latitude"));
    const lng = Number(str(fd, "longitude"));
    const order = await placeOrder(user.id, {
      idempotencyKey: str(fd, "idempotencyKey"),
      customerName: str(fd, "customerName"),
      customerPhone: str(fd, "customerPhone"),
      addressId: addressId && addressId !== "new" ? addressId : null,
      address:
        !addressId || addressId === "new"
          ? {
              cityId: str(fd, "cityId"),
              neighborhoodId: str(fd, "neighborhoodId"),
              street: str(fd, "street"),
              reference: optStr(fd, "reference"),
              latitude: str(fd, "latitude") && Number.isFinite(lat) ? lat : null,
              longitude: str(fd, "longitude") && Number.isFinite(lng) ? lng : null,
              saveAs: fd.get("saveAddress") === "on" ? optStr(fd, "addressLabel") || "Casa" : null,
            }
          : null,
      paymentMethod: str(fd, "paymentMethod") as "MPESA",
      payerPhone: optStr(fd, "payerPhone"),
      notesForRestaurant: optStr(fd, "notesForRestaurant"),
      notesForDelivery: optStr(fd, "notesForDelivery"),
    });
    code = order.code;
    online = order.status === "PENDING_PAYMENT";
  });
  if (result?.ok && code) {
    if (online) {
      try {
        await startPayment(user.id, code);
      } catch {
        /* o cliente pode tentar novamente na página do pedido */
      }
    }
    revalidatePath("/", "layout");
    redirect(`/acompanhar/${code}?novo=1`);
  }
  return result;
}

export async function retryPaymentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return runAction(async () => {
    const p = await startPayment(user.id, str(fd, "code"), optStr(fd, "payerPhone"));
    revalidatePath(`/acompanhar/${str(fd, "code")}`);
    if (p.status === "FAILED") return { ok: false, error: p.failureMessage ?? "O pagamento falhou." };
    if (p.status === "PAID") return { ok: true, message: "Pagamento confirmado." };
    return { ok: true, message: "Pagamento em processamento. Confirme no seu telemóvel." };
  });
}

export async function refreshPaymentAction(code: string) {
  const user = await getSessionUser();
  if (!user) return;
  try {
    await customerRefreshPayment(user.id, code);
  } catch {
    /* ignorado */
  }
}

export async function cancelOrderAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return runAction(async () => {
    const code = str(fd, "code");
    const order = await db.order.findUnique({ where: { code } });
    if (!order || order.customerId !== user.id) throw new AppError("NOT_FOUND", "Pedido não encontrado.");
    await transitionOrder({ role: "CUSTOMER", userId: user.id }, order.id, "CANCELLED", { reason: optStr(fd, "reason") ?? "Cancelado pelo cliente" });
    revalidatePath(`/acompanhar/${code}`);
  }, "Pedido cancelado.");
}

export async function toggleFavoriteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(str(fd, "back") || "/")}`);
  return runAction(async () => {
    const fav = await toggleFavorite(user.id, str(fd, "restaurantId"));
    revalidatePath("/", "layout");
    return { ok: true, message: fav ? "Adicionado aos favoritos." : "Removido dos favoritos." };
  });
}

export async function reviewAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return runAction(async () => {
    await createReview(user.id, str(fd, "code"), Number(str(fd, "rating")), optStr(fd, "comment"));
    revalidatePath(`/acompanhar/${str(fd, "code")}`);
  }, "Obrigado pela sua avaliação!");
}

export async function createTicketAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar?next=/ajuda");
  let id: string | null = null;
  const r = await runAction(async () => {
    const t = await createTicket(user.id, { category: str(fd, "category") as "OTHER", subject: str(fd, "subject"), message: str(fd, "message"), orderCode: optStr(fd, "orderCode") });
    id = t.id;
  });
  if (r?.ok && id) redirect(`/ajuda/tickets/${id}`);
  return r;
}

export async function replyTicketAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return runAction(async () => {
    await replyTicket(user.id, str(fd, "ticketId"), str(fd, "body"));
    revalidatePath(`/ajuda/tickets/${str(fd, "ticketId")}`);
  }, "Mensagem enviada.");
}
