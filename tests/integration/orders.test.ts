import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { db } from "@/server/db";
import { resetDb, makeUser, makeGeo, makeRestaurant, enableProvider } from "../helpers";
import { addToCart, getCartView, setCartCoupon } from "@/server/services/cart";
import { placeOrder, transitionOrder } from "@/server/services/orders";
import { startPayment, processWebhook, applyProviderOutcome, processRefund, reconcilePayments } from "@/server/services/payments";
import { saveCoupon } from "@/server/services/marketing";
import { createReview } from "@/server/services/customer";
import { createSettlement, restaurantBalance } from "@/server/services/finance";

async function scenario(deliveryMode: "RESTAURANT" | "PLATFORM" = "RESTAURANT") {
  const owner = await makeUser();
  const customer = await makeUser();
  const admin = await makeUser({ isSuperAdmin: true });
  const geo = await makeGeo();
  const { restaurant, product } = await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: owner.id, deliveryMode });
  const normal = product.optionGroups[0].options.find((o) => o.name === "Normal")!;
  const big = product.optionGroups[0].options.find((o) => o.name === "Grande")!;
  const cheese = product.optionGroups[1].options[0];
  return { owner, customer, admin, geo, restaurant, product, normal, big, cheese };
}

const checkout = (s: Awaited<ReturnType<typeof scenario>>, over: Record<string, unknown> = {}) => ({
  idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
  customerName: "Cliente",
  customerPhone: "841234567",
  address: { cityId: s.geo.city.id, neighborhoodId: s.geo.nb.id, street: "Av. Teste 123", reference: "Perto do mercado" },
  paymentMethod: "CASH_ON_DELIVERY" as const,
  ...over,
});

function signed(body: object) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", "test-webhook-secret").update(raw).digest("hex");
  return { raw, headers: new Headers({ "x-test-signature": sig }) };
}

beforeEach(async () => {
  await resetDb();
  await enableProvider("CASH_ON_DELIVERY");
  await enableProvider("TEST");
});

describe("sacola", () => {
  it("valida opções obrigatórias e calcula preços no servidor", async () => {
    const s = await scenario();
    await expect(addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [] })).rejects.toThrow(/Tamanho/);
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 2, optionIds: [s.big.id, s.cheese.id] });
    const view = await getCartView({ userId: s.customer.id }, { neighborhoodId: s.geo.nb.id });
    expect(view!.subtotalCents).toBe(2 * (30000 + 5000 + 2000));
    expect(view!.deliveryFeeCents).toBe(5000);
    expect(view!.deliveryAvailable).toBe(true);
    const outside = await getCartView({ userId: s.customer.id }, { neighborhoodId: s.geo.nb2.id });
    expect(outside!.deliveryAvailable).toBe(false);
  });

  it("pede confirmação antes de trocar de restaurante", async () => {
    const s = await scenario();
    const other = await makeRestaurant({ cityId: s.geo.city.id, neighborhoodId: s.geo.nb.id, ownerId: s.owner.id });
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const otherNormal = other.product.optionGroups[0].options[0];
    const r = await addToCart({ userId: s.customer.id }, { productId: other.product.id, quantity: 1, optionIds: [otherNormal.id] });
    expect(r.ok).toBe(false);
    const view = await getCartView({ userId: s.customer.id });
    expect(view!.restaurant.id).toBe(s.restaurant.id);
    const r2 = await addToCart({ userId: s.customer.id }, { productId: other.product.id, quantity: 1, optionIds: [otherNormal.id], replace: true });
    expect(r2.ok).toBe(true);
    expect((await getCartView({ userId: s.customer.id }))!.restaurant.id).toBe(other.restaurant.id);
  });

  it("rejeita opções de outro produto (tentativa de manipulação)", async () => {
    const s = await scenario();
    await expect(
      addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id, "opcao-falsa"] }),
    ).rejects.toThrow(/inválidas/);
  });
});

describe("checkout e motor de pedidos", () => {
  it("cria pedido com totais do servidor e é idempotente", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const input = checkout(s);
    const [a, b] = await Promise.all([placeOrder(s.customer.id, input), placeOrder(s.customer.id, input)]);
    expect(a.id).toBe(b.id);
    expect(await db.order.count()).toBe(1);
    expect(a.status).toBe("PLACED");
    expect(a.totalCents).toBe(30000 + 5000);
    expect(a.commissionCents).toBe(Math.round(30000 * 0.12));
    const events = await db.orderStatusEvent.count({ where: { orderId: a.id } });
    expect(events).toBe(2);
    const notif = await db.notification.count({ where: { userId: s.owner.id, type: "ORDER_NEW" } });
    expect(notif).toBe(1);
  });

  it("recusa bairros fora da zona e restaurantes fechados", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    await expect(placeOrder(s.customer.id, checkout(s, { address: { cityId: s.geo.city.id, neighborhoodId: s.geo.nb2.id, street: "Rua 1" } }))).rejects.toThrow(/não entrega/);
    await db.restaurant.update({ where: { id: s.restaurant.id }, data: { acceptingOrders: false } });
    await expect(placeOrder(s.customer.id, checkout(s))).rejects.toThrow(/pausado/);
  });

  it("recusa métodos de pagamento desativados", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    await expect(placeOrder(s.customer.id, checkout(s, { paymentMethod: "MPESA" }))).rejects.toThrow(/indisponível/);
  });

  it("percorre o fluxo completo com transições válidas e bloqueia transições inválidas", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const order = await placeOrder(s.customer.id, checkout(s));
    const R = { role: "RESTAURANT" as const, userId: s.owner.id };
    await expect(transitionOrder(R, order.id, "DELIVERED")).rejects.toThrow(/Não é possível/);
    await transitionOrder(R, order.id, "ACCEPTED", { prepTimeMinutes: 20 });
    await transitionOrder(R, order.id, "PREPARING");
    await transitionOrder(R, order.id, "READY_FOR_PICKUP");
    await transitionOrder(R, order.id, "PICKED_UP");
    await transitionOrder(R, order.id, "IN_TRANSIT");
    await expect(transitionOrder(R, order.id, "DELIVERED")).rejects.toThrow(/numerário/);
    const done = await transitionOrder(R, order.id, "DELIVERED", { cashCollected: true });
    expect(done.status).toBe("DELIVERED");
    expect(done.paymentStatus).toBe("PAID");
    await expect(transitionOrder(R, order.id, "DELIVERED", { cashCollected: true })).rejects.toThrow();
    const events = await db.orderStatusEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStatus)).toEqual(["PENDING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "IN_TRANSIT", "DELIVERED"]);
  });

  it("transições simultâneas não causam inconsistência", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const order = await placeOrder(s.customer.id, checkout(s));
    const results = await Promise.allSettled([
      transitionOrder({ role: "RESTAURANT", userId: s.owner.id }, order.id, "ACCEPTED"),
      transitionOrder({ role: "CUSTOMER", userId: s.customer.id }, order.id, "CANCELLED", { reason: "Mudei de ideias" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const events = await db.orderStatusEvent.count({ where: { orderId: order.id } });
    expect(events).toBe(3);
  });

  it("cliente não pode cancelar após aceitação", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const order = await placeOrder(s.customer.id, checkout(s));
    await transitionOrder({ role: "RESTAURANT", userId: s.owner.id }, order.id, "ACCEPTED");
    await expect(transitionOrder({ role: "CUSTOMER", userId: s.customer.id }, order.id, "CANCELLED", { reason: "x" })).rejects.toThrow();
  });

  it("avaliação apenas após entrega e uma única vez", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const order = await placeOrder(s.customer.id, checkout(s));
    await expect(createReview(s.customer.id, order.code, 5)).rejects.toThrow(/entregues/);
    const R = { role: "RESTAURANT" as const, userId: s.owner.id };
    for (const st of ["ACCEPTED", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED"] as const) await transitionOrder(R, order.id, st, { cashCollected: true });
    const other = await makeUser();
    await expect(createReview(other.id, order.code, 5)).rejects.toThrow(/não encontrado/);
    await createReview(s.customer.id, order.code, 4, "Bom");
    await expect(createReview(s.customer.id, order.code, 5)).rejects.toThrow(/já foi avaliado/);
    const r = await db.restaurant.findUniqueOrThrow({ where: { id: s.restaurant.id } });
    expect(r.ratingCount).toBe(1);
    expect(r.ratingAvg).toBe(4);
  });
});

describe("cupões", () => {
  it("aplica desconto validado no servidor e respeita limite total", async () => {
    const s = await scenario();
    await saveCoupon({ kind: "admin", userId: s.admin.id }, null, { code: "BEMVINDO", type: "PERCENT", value: 1000, usageLimitTotal: 1, usageLimitPerUser: 1 });
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    await setCartCoupon({ userId: s.customer.id }, "bemvindo");
    const o1 = await placeOrder(s.customer.id, checkout(s));
    expect(o1.discountCents).toBe(3000);
    expect(o1.totalCents).toBe(30000 - 3000 + 5000);
    const c2 = await makeUser();
    await addToCart({ userId: c2.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    await setCartCoupon({ userId: c2.id }, "BEMVINDO");
    await expect(placeOrder(c2.id, checkout(s))).rejects.toThrow(/limite/);
  });

  it("cancelamento devolve a utilização do cupão", async () => {
    const s = await scenario();
    await saveCoupon({ kind: "admin", userId: s.admin.id }, null, { code: "UMAVEZ", type: "FIXED", value: 1000, usageLimitTotal: 1 });
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    await setCartCoupon({ userId: s.customer.id }, "UMAVEZ");
    const o = await placeOrder(s.customer.id, checkout(s));
    await transitionOrder({ role: "CUSTOMER", userId: s.customer.id }, o.id, "CANCELLED", { reason: "Engano" });
    expect((await db.coupon.findUniqueOrThrow({ where: { code: "UMAVEZ" } })).usedCount).toBe(0);
  });

  it("restaurante só cria cupões para a própria loja", async () => {
    const s = await scenario();
    const other = await makeRestaurant({ cityId: s.geo.city.id, neighborhoodId: s.geo.nb.id, ownerId: (await makeUser()).id });
    const c = await saveCoupon({ kind: "restaurant", userId: s.owner.id, restaurantId: s.restaurant.id }, null, {
      code: "LOJA10", type: "PERCENT", value: 1000, restaurantIds: [other.restaurant.id], fundedBy: "PLATFORM",
    });
    const saved = await db.coupon.findUniqueOrThrow({ where: { id: c.id }, include: { restaurants: true } });
    expect(saved.restaurants.map((r) => r.id)).toEqual([s.restaurant.id]);
    expect(saved.fundedBy).toBe("RESTAURANT");
    await expect(saveCoupon({ kind: "restaurant", userId: s.owner.id, restaurantId: other.restaurant.id }, null, { code: "X123", type: "FIXED", value: 100 })).rejects.toThrow(/acesso/);
  });
});

describe("pagamentos online", () => {
  async function onlineOrder() {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const order = await placeOrder(s.customer.id, checkout(s, { paymentMethod: "TEST" }));
    return { s, order };
  }

  it("pedido fica pendente até confirmação validada", async () => {
    const { s, order } = await onlineOrder();
    expect(order.status).toBe("PENDING_PAYMENT");
    const payment = await startPayment(s.customer.id, order.code);
    expect(payment.status).toBe("PROCESSING");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");
    // restaurante não consegue aceitar pedido não pago
    await expect(transitionOrder({ role: "RESTAURANT", userId: s.owner.id }, order.id, "ACCEPTED")).rejects.toThrow();
  });

  it("webhook válido confirma; repetido é ignorado; inválido é rejeitado", async () => {
    const { s, order } = await onlineOrder();
    const payment = await startPayment(s.customer.id, order.code);
    const bad = signed({ id: "evt_bad", reference: payment.reference, status: "paid" });
    await expect(processWebhook("TEST", bad.raw, new Headers({ "x-test-signature": "00" }))).rejects.toThrow(/Assinatura/);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");

    const ok = signed({ id: "evt_1", reference: payment.reference, status: "paid", transactionId: "TX1" });
    const [r1, r2] = await Promise.all([processWebhook("TEST", ok.raw, ok.headers), processWebhook("TEST", ok.raw, ok.headers)]);
    expect([r1.duplicate, r2.duplicate].sort()).toEqual([false, true]);
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("PLACED");
    expect(o.paymentStatus).toBe("PAID");
    const placedEvents = await db.orderStatusEvent.count({ where: { orderId: order.id, toStatus: "PLACED" } });
    expect(placedEvents).toBe(1);
    // reaplicação do mesmo resultado por outra via não duplica efeitos
    await applyProviderOutcome(payment.id, { status: "PAID", providerTransactionId: "TX1" }, "QUERY");
    expect(await db.orderStatusEvent.count({ where: { orderId: order.id, toStatus: "PLACED" } })).toBe(1);
  });

  it("pagamento recusado permite nova tentativa com nova referência", async () => {
    const { s, order } = await onlineOrder();
    const p1 = await startPayment(s.customer.id, order.code);
    const fail = signed({ id: "evt_f", reference: p1.reference, status: "failed" });
    await processWebhook("TEST", fail.raw, fail.headers);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p1.id } })).status).toBe("FAILED");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("FAILED");
    const p2 = await startPayment(s.customer.id, order.code);
    expect(p2.id).not.toBe(p1.id);
    expect(p2.reference).not.toBe(p1.reference);
  });

  it("timeout: pedidos sem pagamento expiram e pagamento tardio gera reembolso", async () => {
    const { s, order } = await onlineOrder();
    const p = await startPayment(s.customer.id, order.code);
    await db.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 3 * 3600_000) } });
    await db.payment.update({ where: { id: p.id }, data: { updatedAt: new Date(Date.now() - 3 * 3600_000), lastCheckedAt: new Date() } });
    await db.$executeRaw`UPDATE "Payment" SET "updatedAt" = now() - interval '3 hours' WHERE id = ${p.id}`;
    const r = await reconcilePayments();
    expect(r.expired).toBe(1);
    const cancelled = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled.status).toBe("CANCELLED");
    const late = signed({ id: "evt_late", reference: p.reference, status: "paid", transactionId: "TXL" });
    await processWebhook("TEST", late.raw, late.headers);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { refunds: true } });
    expect(after.status).toBe("CANCELLED");
    expect(after.paymentStatus).toBe("REFUND_PENDING");
    expect(after.refunds).toHaveLength(1);
    await processRefund(s.admin.id, after.refunds[0].id, { mode: "PROVIDER" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("REFUNDED");
  });

  it("recusa de pedido pago cria reembolso pendente", async () => {
    const { s, order } = await onlineOrder();
    const p = await startPayment(s.customer.id, order.code);
    const ok = signed({ id: "evt_2", reference: p.reference, status: "paid" });
    await processWebhook("TEST", ok.raw, ok.headers);
    await transitionOrder({ role: "RESTAURANT", userId: s.owner.id }, order.id, "REJECTED", { reason: "Sem ingredientes" });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { refunds: true } });
    expect(o.paymentStatus).toBe("REFUND_PENDING");
    expect(o.refunds[0].amountCents).toBe(o.totalCents);
    await expect(processRefund(s.admin.id, o.refunds[0].id, { mode: "MANUAL" })).rejects.toThrow(/referência/);
    await processRefund(s.admin.id, o.refunds[0].id, { mode: "MANUAL", reference: "MP123" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("REFUNDED");
  });
});

describe("financeiro", () => {
  it("liquidação usa apenas pedidos entregues e pagos, sem dupla contagem", async () => {
    const s = await scenario();
    await addToCart({ userId: s.customer.id }, { productId: s.product.id, quantity: 1, optionIds: [s.normal.id] });
    const o = await placeOrder(s.customer.id, checkout(s));
    expect((await restaurantBalance(s.restaurant.id)).orderCount).toBe(0);
    const R = { role: "RESTAURANT" as const, userId: s.owner.id };
    for (const st of ["ACCEPTED", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED"] as const) await transitionOrder(R, o.id, st, { cashCollected: true });
    const bal = await restaurantBalance(s.restaurant.id);
    // Numerário recebido pelo restaurante: o restaurante deve a comissão à plataforma.
    expect(bal.owedToPlatform).toBe(o.totalCents - o.restaurantNetCents);
    expect(bal.netCents).toBeLessThan(0);
    const st = await createSettlement(s.admin.id, s.restaurant.id, new Date());
    expect(st.orderCount).toBe(1);
    await expect(createSettlement(s.admin.id, s.restaurant.id, new Date())).rejects.toThrow(/Não há pedidos/);
  });
});
