import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { resetDb, makeUser, makeGeo, makeRestaurant, enableProvider } from "../helpers";
import { registerCustomer, authenticate, requestPasswordReset, resetPassword, createOwner, closeAccount } from "@/server/services/accounts";
import { saveProduct, deleteProduct, setProductStatus, setProductPrice, saveMenuCategory } from "@/server/services/menu";
import { updateStore, setRestaurantStatus, applyAsPartner, addRestaurantMember, adminUpdateRestaurant, adminSetAcceptingOrders, setHours, upsertZone, setAcceptingOrders } from "@/server/services/restaurants";
import { upsertStaff, setUserStatus, updateSettings, setCourierStatus, updateProviderConfig, createCommissionRule } from "@/server/services/admin";
import { addToCart } from "@/server/services/cart";
import { placeOrder, transitionOrder, getCustomerOrder } from "@/server/services/orders";
import { applyAsCourier } from "@/server/services/couriers";
import { setCourierAvailability, acceptOffer, courierAdvance, declineOffer } from "@/server/services/deliveries";
import { resolveCommission } from "@/server/services/commission";
import { canReadPrivateFile } from "@/server/storage/files";
import { hasAdminPermission } from "@/server/permissions";
import { verifyPassword } from "@/server/auth/password";

beforeEach(async () => {
  await resetDb();
  await enableProvider("CASH_ON_DELIVERY");
});

describe("autenticação", () => {
  it("regista, autentica e rejeita credenciais erradas", async () => {
    const u = await registerCustomer({ name: "Ana", email: "Ana@Example.test", phone: "84 555 1234", password: "segredo123" });
    expect(u.email).toBe("ana@example.test");
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.passwordHash).not.toContain("segredo123");
    expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(authenticate("ana@example.test", "errada123")).rejects.toThrow(/incorretos/);
    await expect(authenticate("naoexiste@example.test", "x")).rejects.toThrow(/incorretos/);
    expect((await authenticate("ana@example.test", "segredo123")).id).toBe(u.id);
    expect((await authenticate("845551234", "segredo123")).id).toBe(u.id);
  });

  it("palavras-passe fracas e duplicados são rejeitados", async () => {
    await expect(registerCustomer({ name: "A", email: "a@b.test", phone: "845551234", password: "123" })).rejects.toThrow();
    await registerCustomer({ name: "Ana", email: "a@b.test", phone: "845551234", password: "segredo123" });
    await expect(registerCustomer({ name: "Ana", email: "a@b.test", phone: "845559999", password: "segredo123" })).rejects.toThrow(/Já existe/);
  });

  it("o registo público não promove a conta a administrador", async () => {
    const u = await registerCustomer({ name: "Mal", email: "m@b.test", phone: "845551111", password: "segredo123", isSuperAdmin: true, staff: { role: "FINANCE" } });
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.id }, include: { staff: true } });
    expect(stored.isSuperAdmin).toBe(false);
    expect(stored.staff).toBeNull();
  });

  it("recuperação de palavra-passe: token de uso único, sessões terminadas", async () => {
    const u = await registerCustomer({ name: "Ana", email: "r@b.test", phone: "845552222", password: "segredo123" });
    await db.session.create({ data: { id: "h1", userId: u.id, expiresAt: new Date(Date.now() + 1e6) } });
    const r = await requestPasswordReset("r@b.test");
    expect(r.token).toBeTruthy();
    expect((await db.emailLog.findFirstOrThrow()).status).toBe("NOT_CONFIGURED");
    await resetPassword(r.token!, "novaSenha456");
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    await expect(resetPassword(r.token!, "outraSenha789")).rejects.toThrow(/inválido|utilizado/);
    expect((await authenticate("r@b.test", "novaSenha456")).id).toBe(u.id);
    await expect(resetPassword("token-falso", "outraSenha789")).rejects.toThrow();
  });

  it("contas suspensas não entram", async () => {
    const u = await registerCustomer({ name: "Susp", email: "s@b.test", phone: "845553333", password: "segredo123" });
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    await expect(authenticate("s@b.test", "segredo123")).rejects.toThrow(/suspensa/);
  });

  it("criação do proprietário exige token e só acontece uma vez", async () => {
    const data = { name: "Dono", email: "dono@b.test", phone: "845554444", password: "SenhaForte123" };
    await expect(createOwner({ ...data, setupToken: "errado" })).rejects.toThrow(/inválido/);
    await expect(createOwner({ ...data, setupToken: "test-setup-token-0123456789", password: "curta1" })).rejects.toThrow();
    const results = await Promise.allSettled([
      createOwner({ ...data, setupToken: "test-setup-token-0123456789" }),
      createOwner({ ...data, email: "dono2@b.test", phone: "845554445", setupToken: "test-setup-token-0123456789" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { isSuperAdmin: true } })).toBe(1);
  });

  it("encerramento de conta anonimiza dados pessoais", async () => {
    const u = await registerCustomer({ name: "Fecha", email: "f@b.test", phone: "845556666", password: "segredo123" });
    await closeAccount(u.id, "segredo123");
    const c = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(c.status).toBe("CLOSED");
    expect(c.email).toBeNull();
    expect(await verifyPassword(c.passwordHash, "segredo123")).toBe(false);
  });
});

describe("isolamento e permissões", () => {
  async function twoRestaurants() {
    const ownerA = await makeUser();
    const ownerB = await makeUser();
    const geo = await makeGeo();
    const a = await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: ownerA.id });
    const b = await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: ownerB.id });
    return { ownerA, ownerB, geo, a, b };
  }

  it("um restaurante não gere produtos nem a loja de outro", async () => {
    const { ownerA, a, b } = await twoRestaurants();
    // Tentativa de usar o identificador de outra loja
    await expect(saveProduct(ownerA.id, b.restaurant.id, null, { name: "Intruso", priceCents: 100, status: "ACTIVE" })).rejects.toThrow(/acesso/);
    // Tentativa de editar produto de outra loja através do próprio restaurante
    await expect(saveProduct(ownerA.id, a.restaurant.id, b.product.id, { name: "Xis", priceCents: 1, status: "ACTIVE" })).rejects.toThrow(/não encontrado/);
    await expect(setProductStatus(ownerA.id, a.restaurant.id, b.product.id, "PAUSED")).rejects.toThrow(/não encontrado/);
    await expect(deleteProduct(ownerA.id, a.restaurant.id, b.product.id)).rejects.toThrow(/não encontrado/);
    await expect(updateStore(ownerA.id, b.restaurant.id, {})).rejects.toThrow(/acesso/);
    expect((await db.product.findUniqueOrThrow({ where: { id: b.product.id } })).priceCents).toBe(30000);
  });

  it("restaurante não altera pedidos de outro restaurante", async () => {
    const { ownerA, b, geo } = await twoRestaurants();
    const customer = await makeUser();
    await addToCart({ userId: customer.id }, { productId: b.product.id, quantity: 1, optionIds: [b.product.optionGroups[0].options[0].id] });
    const order = await placeOrder(customer.id, {
      idempotencyKey: "k-123456789", customerName: "Cliente", customerPhone: "841112222", paymentMethod: "CASH_ON_DELIVERY",
      address: { cityId: geo.city.id, neighborhoodId: geo.nb.id, street: "Rua 1" },
    });
    await expect(transitionOrder({ role: "RESTAURANT", userId: ownerA.id }, order.id, "ACCEPTED")).rejects.toThrow(/acesso/);
    // Cliente não vê pedidos de outros clientes
    const other = await makeUser();
    expect(await getCustomerOrder(other.id, order.code)).toBeNull();
    await expect(transitionOrder({ role: "CUSTOMER", userId: other.id }, order.id, "CANCELLED", { reason: "x" })).rejects.toThrow(/não encontrado/);
  });

  it("operador de pedidos não gere o cardápio nem funcionários", async () => {
    const { ownerA, a } = await twoRestaurants();
    const op = await makeUser();
    await addRestaurantMember(ownerA.id, a.restaurant.id, { email: op.email!, role: "ORDER_OPERATOR" });
    await expect(saveProduct(op.id, a.restaurant.id, null, { name: "Novo", priceCents: 100, status: "ACTIVE" })).rejects.toThrow(/função/);
    await expect(addRestaurantMember(op.id, a.restaurant.id, { email: "x@y.test", role: "OWNER" })).rejects.toThrow(/função/);
  });

  it("utilizadores normais e funcionários não executam ações privilegiadas", async () => {
    const user = await makeUser();
    const finance = await makeUser();
    const owner = await makeUser({ isSuperAdmin: true });
    await expect(upsertStaff(user.id, { email: user.email!, role: "FINANCE" })).rejects.toThrow(/permissão/);
    await upsertStaff(owner.id, { email: finance.email!, role: "FINANCE" });
    await expect(upsertStaff(finance.id, { email: finance.email!, role: "OPERATIONS" })).rejects.toThrow(/permissão/);
    await expect(updateSettings(finance.id, { platformName: "Hack" })).rejects.toThrow(/permissão/);
    await expect(createCommissionRule(finance.id, { percentageBps: 0, fixedCents: 0, effectiveFrom: new Date() })).rejects.toThrow(/permissão/);
    await expect(setUserStatus(finance.id, user.id, "SUSPENDED", "x")).rejects.toThrow(/permissão/);
    await expect(setUserStatus(owner.id, owner.id, "SUSPENDED", "x")).rejects.toThrow();
  });

  it("aprovação de restaurante: pendente não aparece/aceita pedidos", async () => {
    const owner = await makeUser();
    const admin = await makeUser({ isSuperAdmin: true });
    const geo = await makeGeo();
    await db.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const r = await applyAsPartner(owner.id, {
      name: "Novo Sabor", responsibleName: "Dono", phone: "845550000", email: "n@s.test", cityId: geo.city.id, addressLine: "Rua A",
    });
    expect(r.status).toBe("PENDING");
    await expect(setRestaurantStatus(owner.id, r.id, "APPROVED")).rejects.toThrow(/permissão/);
    await expect(setRestaurantStatus(admin.id, r.id, "REJECTED")).rejects.toThrow(/motivo/);
    await setRestaurantStatus(admin.id, r.id, "APPROVED");
    expect((await db.restaurant.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("APPROVED");
    expect(await db.auditLog.count({ where: { entityId: r.id, action: "restaurant.approved" } })).toBe(1);
  });

  it("admin gere cardápio e loja de qualquer restaurante; outros funcionários e clientes não", async () => {
    const { a, geo } = await twoRestaurants();
    const owner = await makeUser({ isSuperAdmin: true });
    const manager = await makeUser();
    const ops = await makeUser();
    const customer = await makeUser();
    await upsertStaff(owner.id, { email: manager.email!, role: "RESTAURANT_MANAGEMENT" });
    await upsertStaff(owner.id, { email: ops.email!, role: "OPERATIONS" });
    const rid = a.restaurant.id;

    const cat = await saveMenuCategory(owner.id, rid, { name: "Bebidas" });
    const p = await saveProduct(manager.id, rid, null, { name: "Sumo natural", priceCents: 12000, status: "ACTIVE", categoryId: cat.id, prepTimeMinutes: 5 });
    expect(p.restaurantId).toBe(rid);
    expect(p.prepTimeMinutes).toBe(5);
    await setProductPrice(owner.id, rid, p.id, 15000);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).priceCents).toBe(15000);
    await setHours(manager.id, rid, [{ dayOfWeek: 1, opensAt: 600, closesAt: 1320 }]);
    await upsertZone(manager.id, rid, { neighborhoodId: geo.nb.id, feeCents: 5000, etaMinutes: 30, isActive: true });
    await adminSetAcceptingOrders(manager.id, rid, false);
    expect((await db.restaurant.findUniqueOrThrow({ where: { id: rid } })).acceptingOrders).toBe(false);

    // Operações e clientes não gerem o cardápio; nenhum admin gere pedidos/equipa do restaurante através deste acesso
    await expect(saveProduct(ops.id, rid, null, { name: "Intruso", priceCents: 1, status: "ACTIVE" })).rejects.toThrow(/acesso/);
    await expect(saveProduct(customer.id, rid, null, { name: "Intruso", priceCents: 1, status: "ACTIVE" })).rejects.toThrow(/acesso/);
    await expect(setProductPrice(customer.id, rid, p.id, 1)).rejects.toThrow(/acesso/);
    await expect(adminSetAcceptingOrders(ops.id, rid, true)).rejects.toThrow(/permissão/);
    await expect(setAcceptingOrders(manager.id, rid, true)).rejects.toThrow(/acesso/);
    await expect(addRestaurantMember(manager.id, rid, { email: "x@y.test", role: "OWNER" })).rejects.toThrow(/acesso/);
    // Restaurante inexistente
    await expect(saveProduct(owner.id, "nao-existe", null, { name: "Xis", priceCents: 1, status: "ACTIVE" })).rejects.toThrow(/não encontrado/);
  });

  it("edição completa de restaurante pelo admin valida dados e cidade/bairro", async () => {
    const { a, geo } = await twoRestaurants();
    const owner = await makeUser({ isSuperAdmin: true });
    const base = { name: "Novo Nome", responsibleName: "Resp", phone: "841234567", cityId: geo.city.id, neighborhoodId: geo.nb.id, addressLine: "Av. 1", prepTimeMinutes: 20, minOrderCents: 0, acceptsCashOnDelivery: true, latitude: -25.96, longitude: 32.57, description: "Comida caseira" };
    await adminUpdateRestaurant(owner.id, a.restaurant.id, base);
    const r = await db.restaurant.findUniqueOrThrow({ where: { id: a.restaurant.id } });
    expect([r.name, r.responsibleName, r.description, r.latitude]).toEqual(["Novo Nome", "Resp", "Comida caseira", -25.96]);
    await expect(adminUpdateRestaurant(owner.id, a.restaurant.id, { ...base, latitude: 200 })).rejects.toThrow();
    await expect(adminUpdateRestaurant(owner.id, a.restaurant.id, { ...base, phone: "123" })).rejects.toThrow();
    const other = await db.city.create({ data: { name: "Outra", slug: "outra-cidade" } });
    await expect(adminUpdateRestaurant(owner.id, a.restaurant.id, { ...base, cityId: other.id })).rejects.toThrow(/Bairro/);
    await expect(adminUpdateRestaurant(a.restaurant.id, a.restaurant.id, base)).rejects.toThrow();
  });

  it("candidatura repetida de parceiro não cria duplicados", async () => {
    const owner = await makeUser();
    const geo = await makeGeo();
    await db.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const data = { name: "Sabor Repetido", responsibleName: "Dono", phone: "845550001", email: "r@s.test", cityId: geo.city.id, addressLine: "Rua A" };
    const [r1, r2] = [await applyAsPartner(owner.id, data), await applyAsPartner(owner.id, { ...data, name: "sabor repetido" })];
    expect(r2.id).toBe(r1.id);
    expect(await db.restaurant.count({ where: { status: "PENDING" } })).toBe(1);
  });

  it("documentos privados só são acessíveis ao dono e a administradores autorizados", () => {
    const file = { ownerId: "u1", purpose: "courier_document" };
    expect(canReadPrivateFile({ id: "u1", isSuperAdmin: false }, file)).toBe(true);
    expect(canReadPrivateFile({ id: "u2", isSuperAdmin: false }, file)).toBe(false);
    expect(canReadPrivateFile(null, file)).toBe(false);
    expect(canReadPrivateFile({ id: "u3", isSuperAdmin: false, status: "ACTIVE", staff: { role: "FINANCE", isActive: true } }, file)).toBe(false);
    expect(canReadPrivateFile({ id: "u4", isSuperAdmin: false, status: "ACTIVE", staff: { role: "OPERATIONS", isActive: true } }, file)).toBe(true);
    expect(hasAdminPermission({ isSuperAdmin: true, status: "ACTIVE" }, "couriers.view")).toBe(true);
  });

  it("métodos de pagamento sem credenciais não podem ser ativados", async () => {
    const admin = await makeUser({ isSuperAdmin: true });
    await expect(updateProviderConfig(admin.id, "MPESA", { enabled: true })).rejects.toThrow(/MPESA_API_KEY/);
    await expect(updateProviderConfig(admin.id, "EMOLA", { enabled: true })).rejects.toThrow();
    await updateProviderConfig(admin.id, "CASH_ON_DELIVERY", { enabled: true });
  });
});

describe("comissões", () => {
  it("regra mais recente aplica-se e pedidos guardam a comissão no momento do pedido", async () => {
    const admin = await makeUser({ isSuperAdmin: true });
    const owner = await makeUser();
    const customer = await makeUser();
    const geo = await makeGeo();
    const { restaurant, product } = await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: owner.id });
    await createCommissionRule(admin.id, { percentageBps: 1000, fixedCents: 0, effectiveFrom: new Date(Date.now() - 1000) });
    expect((await resolveCommission(restaurant.id)).bps).toBe(1000);
    await createCommissionRule(admin.id, { restaurantId: restaurant.id, percentageBps: 800, fixedCents: 0, effectiveFrom: new Date(Date.now() - 1000) });
    expect((await resolveCommission(restaurant.id)).bps).toBe(800);
    await createCommissionRule(admin.id, { restaurantId: restaurant.id, percentageBps: 2000, fixedCents: 0, effectiveFrom: new Date(Date.now() + 86400_000) });
    expect((await resolveCommission(restaurant.id)).bps).toBe(800);

    await addToCart({ userId: customer.id }, { productId: product.id, quantity: 1, optionIds: [product.optionGroups[0].options[0].id] });
    const order = await placeOrder(customer.id, {
      idempotencyKey: "k-commission", customerName: "Cliente", customerPhone: "841112222", paymentMethod: "CASH_ON_DELIVERY",
      address: { cityId: geo.city.id, neighborhoodId: geo.nb.id, street: "Rua 1" },
    });
    expect(order.commissionBps).toBe(800);
    await createCommissionRule(admin.id, { restaurantId: restaurant.id, percentageBps: 3000, fixedCents: 0, effectiveFrom: new Date(Date.now() - 500) });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).commissionBps).toBe(800);
  });
});

describe("entregadores", () => {
  async function platformOrder() {
    const admin = await makeUser({ isSuperAdmin: true });
    const owner = await makeUser();
    const customer = await makeUser();
    const geo = await makeGeo();
    const { restaurant, product } = await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: owner.id, deliveryMode: "PLATFORM" });
    const couriers = [];
    for (let i = 0; i < 2; i++) {
      const u = await makeUser();
      const file = await db.storedFile.create({ data: { ownerId: u.id, visibility: "PRIVATE", purpose: "courier_document", mimeType: "application/pdf", size: 1, sha256: "x", driver: "db" } });
      const c = await applyAsCourier(u.id, { cityId: geo.city.id, vehicleType: "BICYCLE", idNumber: "ABC12345" }, [{ type: "ID_CARD", fileId: file.id }]);
      couriers.push({ user: u, courier: c });
    }
    await addToCart({ userId: customer.id }, { productId: product.id, quantity: 1, optionIds: [product.optionGroups[0].options[0].id] });
    const order = await placeOrder(customer.id, {
      idempotencyKey: "k-platform", customerName: "Cliente", customerPhone: "841112222", paymentMethod: "CASH_ON_DELIVERY",
      address: { cityId: geo.city.id, neighborhoodId: geo.nb.id, street: "Rua 1" },
    });
    return { admin, owner, customer, couriers, order, restaurant };
  }

  it("entregador pendente não fica disponível; aprovado recebe ofertas", async () => {
    const { admin, owner, couriers, order } = await platformOrder();
    await expect(setCourierAvailability(couriers[0].user.id, true)).rejects.toThrow(/aprovada/);
    for (const c of couriers) {
      await setCourierStatus(admin.id, c.courier.id, "APPROVED");
      await setCourierAvailability(c.user.id, true);
    }
    await transitionOrder({ role: "RESTAURANT", userId: owner.id }, order.id, "ACCEPTED");
    const offers = await db.deliveryOffer.findMany({ where: { status: "OFFERED" } });
    expect(offers).toHaveLength(2);
  });

  it("apenas um entregador aceita a mesma entrega (concorrência)", async () => {
    const { admin, owner, couriers, order } = await platformOrder();
    for (const c of couriers) {
      await setCourierStatus(admin.id, c.courier.id, "APPROVED");
      await setCourierAvailability(c.user.id, true);
    }
    await transitionOrder({ role: "RESTAURANT", userId: owner.id }, order.id, "ACCEPTED");
    const offers = await db.deliveryOffer.findMany({ include: { courier: true } });
    const results = await Promise.allSettled(offers.map((o) => acceptOffer(o.courier.userId, o.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const d = await db.delivery.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(d.status).toBe("ASSIGNED");
    // O outro entregador não pode recolher
    const loser = offers.find((o) => o.courierId !== d.courierId)!;
    await expect(courierAdvance(loser.courier.userId, d.id, "PICKED_UP")).rejects.toThrow(/não encontrada/);
    await expect(declineOffer(loser.courier.userId, loser.id)).rejects.toThrow(/já não está disponível/);
  });

  it("recolha só depois de pronto; entrega com confirmação de numerário", async () => {
    const { admin, owner, couriers, order, customer } = await platformOrder();
    const c = couriers[0];
    await setCourierStatus(admin.id, c.courier.id, "APPROVED");
    await setCourierAvailability(c.user.id, true);
    await transitionOrder({ role: "RESTAURANT", userId: owner.id }, order.id, "ACCEPTED");
    const offer = await db.deliveryOffer.findFirstOrThrow({ where: { courierId: c.courier.id } });
    const d = await acceptOffer(c.user.id, offer.id);
    await expect(courierAdvance(c.user.id, d.id, "PICKED_UP")).rejects.toThrow(/Não é possível/);
    // restaurante não pode marcar recolha quando a entrega é da plataforma
    await transitionOrder({ role: "RESTAURANT", userId: owner.id }, order.id, "READY_FOR_PICKUP");
    await expect(transitionOrder({ role: "RESTAURANT", userId: owner.id }, order.id, "PICKED_UP")).rejects.toThrow();
    await courierAdvance(c.user.id, d.id, "PICKED_UP");
    await courierAdvance(c.user.id, d.id, "IN_TRANSIT");
    await expect(courierAdvance(c.user.id, d.id, "DELIVERED")).rejects.toThrow(/numerário/);
    await courierAdvance(c.user.id, d.id, "DELIVERED", { cashCollected: true });
    const done = await db.delivery.findUniqueOrThrow({ where: { id: d.id }, include: { order: true } });
    expect(done.status).toBe("DELIVERED");
    expect(done.order.paymentStatus).toBe("PAID");
    expect(done.order.cashCollectedById).toBe(c.user.id);
    expect(await db.notification.count({ where: { userId: customer.id, type: "COURIER_ASSIGNED" } })).toBe(1);
  });

  it("cancelamento pelo admin cancela a entrega e as ofertas", async () => {
    const { admin, owner, couriers, order } = await platformOrder();
    await setCourierStatus(admin.id, couriers[0].courier.id, "APPROVED");
    await setCourierAvailability(couriers[0].user.id, true);
    await transitionOrder({ role: "RESTAURANT", userId: owner.id }, order.id, "ACCEPTED");
    await transitionOrder({ role: "ADMIN", userId: admin.id }, order.id, "CANCELLED", { reason: "Pedido de suporte" });
    expect((await db.delivery.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("CANCELLED");
    expect(await db.deliveryOffer.count({ where: { status: "OFFERED" } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: order.id, action: "order.status_change" } })).toBe(1);
  });
});
