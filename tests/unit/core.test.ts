import { describe, it, expect } from "vitest";
import { findTransition, allowedNextStatuses } from "@/server/services/order-state";
import { computeFinancials, computeServiceFee } from "@/server/services/pricing";
import { formatMoney, parseMoneyToCents, applyBps } from "@/lib/money";
import { isOpenAt, isWithinWindow } from "@/lib/hours";
import { normalizeMzPhone, slugify, timeToMinutes } from "@/lib/utils";
import { hasAdminPermission, hasRestaurantPermission } from "@/server/permissions";
import { interpret } from "@/server/payments/mpesa";
import { detectType } from "@/server/storage/files";

describe("máquina de estados", () => {
  it("permite fluxo válido do restaurante", () => {
    expect(findTransition("PLACED", "ACCEPTED", "RESTAURANT", "RESTAURANT")).toBeTruthy();
    expect(findTransition("ACCEPTED", "PREPARING", "RESTAURANT", "RESTAURANT")).toBeTruthy();
    expect(findTransition("READY_FOR_PICKUP", "PICKED_UP", "RESTAURANT", "RESTAURANT")).toBeTruthy();
  });
  it("bloqueia transições inválidas", () => {
    expect(findTransition("DELIVERED", "DELIVERED", "ADMIN", "RESTAURANT")).toBeNull();
    expect(findTransition("CANCELLED", "ACCEPTED", "ADMIN", "RESTAURANT")).toBeNull();
    expect(findTransition("PENDING_PAYMENT", "PLACED", "CUSTOMER", "RESTAURANT")).toBeNull();
    expect(findTransition("PENDING_PAYMENT", "PLACED", "RESTAURANT", "RESTAURANT")).toBeNull();
    expect(findTransition("ACCEPTED", "CANCELLED", "CUSTOMER", "RESTAURANT")).toBeNull();
  });
  it("respeita o modelo de entrega", () => {
    expect(findTransition("READY_FOR_PICKUP", "PICKED_UP", "RESTAURANT", "PLATFORM")).toBeNull();
    expect(findTransition("READY_FOR_PICKUP", "PICKED_UP", "COURIER", "PLATFORM")).toBeTruthy();
    expect(findTransition("READY_FOR_PICKUP", "PICKED_UP", "COURIER", "RESTAURANT")).toBeNull();
  });
  it("lista próximos estados", () => {
    expect(allowedNextStatuses("PLACED", "RESTAURANT", "RESTAURANT").sort()).toEqual(["ACCEPTED", "REJECTED"]);
  });
});

describe("cálculos financeiros", () => {
  const base = { subtotalCents: 100000, discountCents: 0, discountFundedBy: null, deliveryFeeCents: 5000, serviceFeeCents: 1000, commissionBps: 1500, commissionFixedCents: 0, courierFeeShareBps: 8000, courierBaseFeeCents: 0 } as const;
  it("entrega própria: taxa de entrega vai para o restaurante", () => {
    const f = computeFinancials({ ...base, deliveryMode: "RESTAURANT" });
    expect(f.totalCents).toBe(106000);
    expect(f.commissionCents).toBe(15000);
    expect(f.restaurantNetCents).toBe(90000);
    expect(f.courierFeeCents).toBe(0);
  });
  it("entrega pela plataforma: entregador recebe percentagem da taxa", () => {
    const f = computeFinancials({ ...base, deliveryMode: "PLATFORM" });
    expect(f.restaurantNetCents).toBe(85000);
    expect(f.courierFeeCents).toBe(4000);
  });
  it("desconto financiado pelo restaurante reduz a base da comissão", () => {
    const f = computeFinancials({ ...base, deliveryMode: "PLATFORM", discountCents: 20000, discountFundedBy: "RESTAURANT" });
    expect(f.commissionCents).toBe(12000);
    expect(f.restaurantNetCents).toBe(68000);
    expect(f.totalCents).toBe(86000);
  });
  it("desconto nunca excede o subtotal", () => {
    const f = computeFinancials({ ...base, deliveryMode: "PLATFORM", discountCents: 999999, discountFundedBy: "PLATFORM" });
    expect(f.discountCents).toBe(100000);
    expect(f.totalCents).toBe(6000);
  });
  it("taxa de serviço com limite", () => {
    expect(computeServiceFee(100000, { serviceFeeBps: 500, serviceFeeFixedCents: 100, serviceFeeMaxCents: 3000 })).toBe(3000);
    expect(computeServiceFee(0, { serviceFeeBps: 500, serviceFeeFixedCents: 100, serviceFeeMaxCents: null })).toBe(0);
  });
});

describe("utilitários", () => {
  it("dinheiro", () => {
    expect(parseMoneyToCents("150,50")).toBe(15050);
    expect(parseMoneyToCents("1.200,00")).toBe(120000);
    expect(parseMoneyToCents("99.9")).toBe(9990);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(applyBps(1001, 1500)).toBe(150);
    expect(formatMoney(15050, "MZN")).toMatch(/150,50/);
  });
  it("telefones moçambicanos", () => {
    expect(normalizeMzPhone("84 123 4567")).toBe("258841234567");
    expect(normalizeMzPhone("+258 85 123 4567")).toBe("258851234567");
    expect(normalizeMzPhone("12345")).toBeNull();
  });
  it("slug e horas", () => {
    expect(slugify("Galinha à Zambeziana!")).toBe("galinha-a-zambeziana");
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("25:00")).toBeNull();
  });
  it("horário de abertura (incluindo turno noturno)", () => {
    const tz = "Africa/Maputo"; // UTC+2
    const monday10 = new Date("2026-10-26T08:00:00Z"); // segunda 10:00 local
    expect(isOpenAt([{ dayOfWeek: 1, opensAt: 540, closesAt: 1320 }], monday10, tz)).toBe(true);
    expect(isOpenAt([{ dayOfWeek: 1, opensAt: 660, closesAt: 1320 }], monday10, tz)).toBe(false);
    const tue01 = new Date("2026-10-26T23:00:00Z"); // terça 01:00 local
    expect(isOpenAt([{ dayOfWeek: 1, opensAt: 1080, closesAt: 120 }], tue01, tz)).toBe(true);
    expect(isOpenAt([], monday10, tz)).toBe(false);
    expect(isWithinWindow(1320, 120, tue01, tz)).toBe(true);
  });
});

describe("permissões", () => {
  it("funcionários não têm permissões privilegiadas", () => {
    const finance = { isSuperAdmin: false, status: "ACTIVE", staff: { role: "FINANCE" as const, isActive: true } };
    expect(hasAdminPermission(finance, "finance.manage")).toBe(true);
    expect(hasAdminPermission(finance, "settings.manage")).toBe(false);
    expect(hasAdminPermission(finance, "staff.manage")).toBe(false);
    expect(hasAdminPermission({ ...finance, staff: { role: "FINANCE", isActive: false } }, "finance.view")).toBe(false);
    expect(hasAdminPermission({ isSuperAdmin: true, status: "SUSPENDED" }, "finance.view")).toBe(false);
    expect(hasAdminPermission({ isSuperAdmin: false }, "dashboard.view")).toBe(false);
  });
  it("funções do restaurante", () => {
    expect(hasRestaurantPermission("ORDER_OPERATOR", "menu.manage")).toBe(false);
    expect(hasRestaurantPermission("MANAGER", "staff.manage")).toBe(false);
    expect(hasRestaurantPermission("OWNER", "payout.manage")).toBe(true);
  });
});

describe("M-Pesa: interpretação de respostas", () => {
  it("INS-0 é pago", () => {
    const r = interpret(201, { output_ResponseCode: "INS-0", output_TransactionID: "abc", output_ConversationID: "c1" });
    expect(r.status).toBe("PAID");
  });
  it("códigos de erro são falha", () => {
    const r = interpret(422, { output_ResponseCode: "INS-2006", output_ResponseDesc: "Insufficient balance" });
    expect(r.status).toBe("FAILED");
    if (r.status === "FAILED") expect(r.failureMessage).toMatch(/Saldo insuficiente/);
  });
  it("resposta sem código é incerta", () => {
    expect(interpret(500, {}).status).toBe("PROCESSING");
  });
});

describe("validação de uploads", () => {
  it("deteta tipos pelos bytes", () => {
    expect(detectType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(detectType(Buffer.from("%PDF-1.7 aaaaaaaa"))).toBe("application/pdf");
    expect(detectType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(detectType(Buffer.from("GIF89a......"))).toBeNull();
  });
});
