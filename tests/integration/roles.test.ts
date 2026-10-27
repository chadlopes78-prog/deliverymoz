import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { resetDb, makeUser, makeGeo, makeRestaurant, enableProvider } from "../helpers";
import { destinationAfterLogin } from "@/server/routing";
import { authenticate, registerCustomer } from "@/server/services/accounts";
import { setUserStatus, upsertStaff } from "@/server/services/admin";
import { applyAsPartner } from "@/server/services/restaurants";
import { saveProduct } from "@/server/services/menu";
import { saveCoupon } from "@/server/services/marketing";
import { hasAdminPermission, staffPermissions } from "@/server/permissions";
import { platformActivity, platformTotals } from "@/server/services/activity";

beforeEach(async () => {
  await resetDb();
  await enableProvider("CASH_ON_DELIVERY");
  await db.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
});

describe("encaminhamento depois do login (decidido no servidor)", () => {
  it("super admin vai para o centro de controlo por qualquer opção; parceiro e comprador para as suas áreas", async () => {
    const owner = await makeUser({ isSuperAdmin: true });
    const buyer = await makeUser();
    const partner = await makeUser();
    const newPartner = await makeUser();
    const geo = await makeGeo();
    await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: partner.id });

    expect(await destinationAfterLogin(owner.id, "comprador")).toBe("/admin");
    expect(await destinationAfterLogin(owner.id, "parceiro")).toBe("/admin");
    expect(await destinationAfterLogin(partner.id, "parceiro")).toBe("/parceiro");
    expect(await destinationAfterLogin(newPartner.id, "parceiro")).toBe("/parceiro/registo");
    expect(await destinationAfterLogin(buyer.id, "comprador")).toBe("/");
    // Um comprador que escolhe "parceiro" não ganha acesso: vai para o registo de restaurante
    expect(await destinationAfterLogin(buyer.id, "parceiro")).toBe("/parceiro/registo");
    // Destino explícito é respeitado; destinos externos são ignorados
    expect(await destinationAfterLogin(owner.id, "comprador", "/checkout")).toBe("/checkout");
    expect(await destinationAfterLogin(buyer.id, "comprador", "//malicioso.example")).toBe("/");
  });
});

describe("suspensão e banimento", () => {
  it("banir termina sessões, bloqueia o login, mantém o histórico e regista quem fez a ação", async () => {
    const owner = await makeUser({ isSuperAdmin: true });
    const support = await makeUser();
    await upsertStaff(owner.id, { email: support.email!, role: "SUPPORT" });
    const buyer = await registerCustomer({ name: "Comprador", email: "c@ban.test", phone: "848880001", password: "Comprador123" });
    await db.session.create({ data: { id: "s".repeat(64), userId: buyer.id, expiresAt: new Date(Date.now() + 86400_000) } });

    await expect(setUserStatus(owner.id, buyer.id, "BANNED", "")).rejects.toThrow(/motivo/);
    // Funcionários de suporte podem suspender, mas não banir
    await expect(setUserStatus(support.id, buyer.id, "BANNED", "abuso")).rejects.toThrow(/Super Admin/);
    await setUserStatus(owner.id, buyer.id, "BANNED", "Fraude repetida");
    expect(await db.session.count({ where: { userId: buyer.id } })).toBe(0);
    await expect(authenticate("c@ban.test", "Comprador123")).rejects.toThrow(/retirado/);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "user.ban", entityId: buyer.id } });
    expect(log.actorId).toBe(owner.id);
    expect(await db.user.count({ where: { id: buyer.id } })).toBe(1);
    // Só o Super Admin reativa uma conta banida
    await expect(setUserStatus(support.id, buyer.id, "ACTIVE")).rejects.toThrow(/Super Admin/);
    await setUserStatus(owner.id, buyer.id, "ACTIVE");
    expect((await authenticate("c@ban.test", "Comprador123")).id).toBe(buyer.id);
  });

  it("o Super Admin não pode ser suspenso nem banido por ninguém", async () => {
    const owner = await makeUser({ isSuperAdmin: true });
    const owner2 = await makeUser({ isSuperAdmin: true });
    const support = await makeUser();
    await upsertStaff(owner.id, { email: support.email!, role: "SUPPORT" });
    await expect(setUserStatus(support.id, owner.id, "SUSPENDED", "x")).rejects.toThrow();
    await expect(setUserStatus(owner2.id, owner.id, "BANNED", "x")).rejects.toThrow(/proprietário/);
  });
});

describe("administradores secundários com permissões personalizadas", () => {
  it("permissões personalizadas substituem as da função e nunca incluem as exclusivas do Super Admin", async () => {
    const owner = await makeUser({ isSuperAdmin: true });
    const adm = await makeUser();
    await expect(upsertStaff(owner.id, { email: adm.email!, role: "SUPPORT", permissions: ["settings.manage"] })).rejects.toThrow(/Super Admin/);
    await upsertStaff(owner.id, { email: adm.email!, role: "SUPPORT", permissions: ["restaurants.view", "orders.view"] });
    const staff = await db.staffMember.findUniqueOrThrow({ where: { userId: adm.id } });
    expect(staffPermissions(staff).sort()).toEqual(["dashboard.view", "orders.view", "restaurants.view"]);
    const subject = { isSuperAdmin: false, status: "ACTIVE", staff };
    expect(hasAdminPermission(subject, "orders.view")).toBe(true);
    expect(hasAdminPermission(subject, "support.manage")).toBe(false);
    expect(hasAdminPermission(subject, "staff.manage")).toBe(false);
    // Um administrador secundário não gere administradores
    await expect(upsertStaff(adm.id, { email: adm.email!, role: "OPERATIONS" })).rejects.toThrow(/permissão/);
  });
});

describe("estado do restaurante limita o painel do parceiro", () => {
  it("pendente prepara o cardápio mas não cria promoções; suspenso não altera o cardápio", async () => {
    const owner = await makeUser();
    const admin = await makeUser({ isSuperAdmin: true });
    const geo = await makeGeo();
    const r = await applyAsPartner(owner.id, { name: "Pendente", responsibleName: "Dono", phone: "845550099", email: "p@p.test", cityId: geo.city.id, addressLine: "Rua A" });
    await saveProduct(owner.id, r.id, null, { name: "Prato", priceCents: 1000, status: "ACTIVE" });
    const coupon = { code: "PEND10", type: "PERCENT" as const, value: 1000, minSubtotalCents: 0, isActive: true, firstOrderOnly: false };
    await expect(saveCoupon({ kind: "restaurant", userId: owner.id, restaurantId: r.id }, null, coupon)).rejects.toThrow(/aprovado/);
    await db.restaurant.update({ where: { id: r.id }, data: { status: "SUSPENDED" } });
    await expect(saveProduct(owner.id, r.id, null, { name: "Outro", priceCents: 1000, status: "ACTIVE" })).rejects.toThrow(/suspenso/);
    // O admin continua a poder gerir o restaurante
    await saveProduct(admin.id, r.id, null, { name: "Pelo admin", priceCents: 1000, status: "ACTIVE" });
  });
});

describe("atividade e totais da plataforma", () => {
  it("são calculados a partir dos dados reais", async () => {
    const owner = await makeUser({ isSuperAdmin: true });
    const empty = await platformTotals();
    expect(empty.restaurants).toBe(0);
    expect(empty.ordersTotal).toBe(0);
    const partner = await makeUser();
    const geo = await makeGeo();
    await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: partner.id });
    const t = await platformTotals();
    expect(t.restaurants).toBe(1);
    expect(t.partners).toBe(1);
    expect(t.productsActive).toBeGreaterThan(0);
    const items = await platformActivity({ take: 20 });
    expect(items.some((i) => i.title === "Nova conta de parceiro")).toBe(true);
    expect(items.some((i) => i.kind === "produtos")).toBe(true);
    expect(items.every((i) => !JSON.stringify(i).includes("passwordHash"))).toBe(true);
    void owner;
  });
});

describe("ativação da conta do proprietário (conta já registada como compradora)", () => {
  const prevToken = process.env.SETUP_TOKEN;
  const prevOwner = process.env.OWNER_EMAIL;
  const restore = () => {
    process.env.SETUP_TOKEN = prevToken;
    if (prevOwner === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = prevOwner;
  };

  it("encaminha para a ativação, exige código e palavra-passe, respeita OWNER_EMAIL e só acontece uma vez", async () => {
    process.env.SETUP_TOKEN = "codigo-de-teste-0123456789";
    process.env.OWNER_EMAIL = "dono@plataforma.test";
    try {
      const { activateOwnerAccount, needsOwnerActivation } = await import("@/server/services/accounts");
      const dono = await registerCustomer({ name: "Dono", email: "dono@plataforma.test", phone: "848880101", password: "DonoSenha123" });
      const outro = await registerCustomer({ name: "Outro", email: "outro@plataforma.test", phone: "848880102", password: "OutroSenha123" });
      expect(await needsOwnerActivation({ email: "dono@plataforma.test", isSuperAdmin: false })).toBe(true);
      expect(await needsOwnerActivation({ email: "outro@plataforma.test", isSuperAdmin: false })).toBe(false);
      // Depois do login, a conta do proprietário vai para a ativação e não para a área de compras
      expect(await destinationAfterLogin(dono.id, "comprador")).toBe("/admin/login");
      expect(await destinationAfterLogin(outro.id, "comprador")).toBe("/");

      await expect(activateOwnerAccount(dono.id, "errado-errado-errado", "DonoSenha123")).rejects.toThrow(/inválido/);
      await expect(activateOwnerAccount(dono.id, "codigo-de-teste-0123456789", "errada")).rejects.toThrow(/incorreta/);
      await expect(activateOwnerAccount(outro.id, "codigo-de-teste-0123456789", "OutroSenha123")).rejects.toThrow(/autorizado/);
      await activateOwnerAccount(dono.id, "codigo-de-teste-0123456789", "DonoSenha123");
      expect((await db.user.findUniqueOrThrow({ where: { id: dono.id } })).isSuperAdmin).toBe(true);
      expect(await db.auditLog.count({ where: { action: "setup.owner_activated", entityId: dono.id } })).toBe(1);
      expect(await destinationAfterLogin(dono.id, "comprador")).toBe("/admin");
      // Uma segunda ativação é recusada
      delete process.env.OWNER_EMAIL;
      await expect(activateOwnerAccount(outro.id, "codigo-de-teste-0123456789", "OutroSenha123")).rejects.toThrow(/já foi criada/);
    } finally {
      restore();
    }
  });
});

describe("publicar e despublicar restaurantes", () => {
  it("restaurante despublicado sai do site e deixa de aceitar pedidos, sem perder a aprovação", async () => {
    const { adminSetListed } = await import("@/server/services/restaurants");
    const { listRestaurants } = await import("@/server/services/catalog");
    const { restaurantAvailability } = await import("@/server/services/availability");
    const owner = await makeUser({ isSuperAdmin: true });
    const partner = await makeUser();
    const geo = await makeGeo();
    const { restaurant } = await makeRestaurant({ cityId: geo.city.id, neighborhoodId: geo.nb.id, ownerId: partner.id });
    expect((await listRestaurants({ cityId: geo.city.id })).some((r) => r.id === restaurant.id)).toBe(true);
    await expect(adminSetListed(partner.id, restaurant.id, false)).rejects.toThrow(/permissão/);
    await adminSetListed(owner.id, restaurant.id, false);
    const r = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id }, include: { hours: true } });
    expect(r.status).toBe("APPROVED");
    expect((await listRestaurants({ cityId: geo.city.id })).some((x) => x.id === restaurant.id)).toBe(false);
    expect(restaurantAvailability(r, "Africa/Maputo").orderable).toBe(false);
    await adminSetListed(owner.id, restaurant.id, true);
    expect((await listRestaurants({ cityId: geo.city.id })).some((x) => x.id === restaurant.id)).toBe(true);
  });
});
