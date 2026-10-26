"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrderStatus, StaffRole, TicketPriority, TicketStatus } from "@prisma/client";
import { requireAdmin } from "@/server/guards";
import { runAction, str, optStr, bool, int, file, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";
import { parseMoneyToCents } from "@/lib/money";
import { zonedToUtc } from "@/lib/hours";
import { destroySession } from "@/server/auth/session";
import {
  setUserStatus, upsertStaff, setStaffActive, updateSettings, setPlatformLogo, completeSetup, saveCity, addNeighborhoods,
  setNeighborhoodActive, saveCuisine, updateProviderConfig, createCommissionRule, setCourierStatus,
} from "@/server/services/admin";
import { setRestaurantStatus, adminUpdateRestaurantCommercial, adminCreateRestaurant } from "@/server/services/restaurants";
import { transitionOrder } from "@/server/services/orders";
import { requestRefund, processRefund, refreshPaymentStatus } from "@/server/services/payments";
import { adminAssignCourier, dispatchDelivery } from "@/server/services/deliveries";
import { createSettlement, markSettlementPaid, cancelSettlement, createCourierPayout } from "@/server/services/finance";
import { saveCoupon, setCouponActive, saveCampaign, saveBanner, deleteBanner } from "@/server/services/marketing";
import { adminReplyTicket } from "@/server/services/support";
import { moderateReview } from "@/server/services/customer";
import { storePublicImage } from "@/server/storage/files";
import { db } from "@/server/db";

export async function adminLogoutAction() {
  await destroySession();
  redirect("/entrar");
}

const pct = (fd: FormData, k: string) => {
  const v = Number(str(fd, k).replace(",", "."));
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new AppError("VALIDATION", "Percentagem inválida (0 a 100).");
  return Math.round(v * 100);
};
const money = (fd: FormData, k: string, required = true) => {
  const v = parseMoneyToCents(str(fd, k));
  if (v == null) {
    if (required) throw new AppError("VALIDATION", "Valor monetário inválido.");
    return null;
  }
  if (v < 0) throw new AppError("VALIDATION", "Valor monetário inválido.");
  return v;
};
const date = async (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return null;
  const tz = (await db.platformSettings.findUnique({ where: { id: 1 } }))?.timezone ?? "Africa/Maputo";
  const d = zonedToUtc(v, tz);
  if (!d) throw new AppError("VALIDATION", "Data inválida.");
  return d;
};

// ─────────────── Restaurantes ───────────────

export async function restaurantStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("restaurants.manage");
  return runAction(async () => {
    await setRestaurantStatus(admin.id, str(fd, "id"), str(fd, "status") as "APPROVED", optStr(fd, "reason"));
    revalidatePath("/admin/restaurantes", "layout");
  }, "Estado atualizado.");
}

export async function restaurantCommercialAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("restaurants.manage");
  return runAction(async () => {
    await adminUpdateRestaurantCommercial(admin.id, str(fd, "id"), {
      allowRestaurantDelivery: bool(fd, "allowRestaurantDelivery"),
      allowPlatformDelivery: bool(fd, "allowPlatformDelivery"),
      isFeatured: bool(fd, "isFeatured"),
    });
    revalidatePath("/admin/restaurantes", "layout");
  }, "Definições guardadas.");
}

export async function createRestaurantAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("restaurants.manage");
  let id: string | null = null;
  const r = await runAction(async () => {
    const mode = str(fd, "ownerMode") as "existing" | "new" | "none";
    const owner =
      mode === "existing" ? { mode, email: str(fd, "ownerEmail") } as const
      : mode === "new" ? { mode, name: str(fd, "ownerName"), email: str(fd, "ownerEmail"), phone: str(fd, "ownerPhone"), password: String(fd.get("ownerPassword") ?? "") } as const
      : { mode: "none" } as const;
    const created = await adminCreateRestaurant(admin.id, {
      name: str(fd, "name"), responsibleName: str(fd, "responsibleName"), phone: str(fd, "phone"), email: str(fd, "email"),
      cityId: str(fd, "cityId"), neighborhoodId: optStr(fd, "neighborhoodId"), addressLine: str(fd, "addressLine"),
      addressReference: optStr(fd, "addressReference"), legalName: optStr(fd, "legalName"), nuit: optStr(fd, "nuit"),
    }, owner);
    id = created.id;
  });
  if (r?.ok && id) redirect(`/admin/restaurantes/${id}?criado=1`);
  return r;
}

export async function reviewModerationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("restaurants.manage");
  return runAction(async () => {
    await moderateReview(admin.id, str(fd, "id"), str(fd, "status") as "HIDDEN");
    revalidatePath("/admin/restaurantes", "layout");
  }, "Avaliação atualizada.");
}

// ─────────────── Clientes / utilizadores ───────────────

export async function userStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("customers.manage");
  return runAction(async () => {
    await setUserStatus(admin.id, str(fd, "id"), str(fd, "status") as "ACTIVE", optStr(fd, "reason"));
    revalidatePath("/admin/clientes", "layout");
  }, "Estado da conta atualizado.");
}

// ─────────────── Entregadores ───────────────

export async function courierStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("couriers.manage");
  return runAction(async () => {
    await setCourierStatus(admin.id, str(fd, "id"), str(fd, "status") as "APPROVED", optStr(fd, "reason"));
    revalidatePath("/admin/entregadores", "layout");
  }, "Estado atualizado.");
}

export async function resolveIssueAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin("deliveries.manage");
  return runAction(async () => {
    await db.deliveryIssue.update({ where: { id: str(fd, "id") }, data: { resolvedAt: new Date() } });
    revalidatePath("/admin/entregas");
  }, "Problema marcado como resolvido.");
}

// ─────────────── Pedidos e entregas ───────────────

export async function adminOrderStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("orders.intervene");
  return runAction(async () => {
    await transitionOrder({ role: "ADMIN", userId: admin.id }, str(fd, "id"), str(fd, "to") as OrderStatus, {
      reason: optStr(fd, "reason"),
      prepTimeMinutes: int(fd, "prepTimeMinutes", 30),
      cashCollected: bool(fd, "cashCollected"),
    });
    revalidatePath("/admin/pedidos", "layout");
  }, "Pedido atualizado.");
}

export async function adminCheckPaymentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin("orders.view");
  return runAction(async () => {
    const p = await refreshPaymentStatus(str(fd, "paymentId"));
    revalidatePath("/admin/pedidos", "layout");
    return { ok: true, message: `Estado atual: ${p?.status ?? "desconhecido"}.` };
  });
}

export async function assignCourierAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("deliveries.manage");
  return runAction(async () => {
    await adminAssignCourier(admin.id, str(fd, "deliveryId"), optStr(fd, "courierId"));
    revalidatePath("/admin/entregas");
    revalidatePath("/admin/pedidos", "layout");
  }, "Entrega atualizada.");
}

export async function redispatchAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin("deliveries.manage");
  return runAction(async () => {
    const id = str(fd, "deliveryId");
    await db.deliveryOffer.deleteMany({ where: { deliveryId: id, status: { in: ["EXPIRED", "DECLINED"] } } });
    const r = await dispatchDelivery(id);
    revalidatePath("/admin/entregas");
    return { ok: true, message: r.offered ? `Oferta enviada a ${r.offered} entregador(es).` : "Não há entregadores disponíveis nesta cidade." };
  });
}

// ─────────────── Financeiro ───────────────

export async function requestRefundAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("finance.manage");
  return runAction(async () => {
    await requestRefund(admin.id, str(fd, "orderId"), money(fd, "amount")!, str(fd, "reason"));
    revalidatePath("/admin", "layout");
  }, "Reembolso registado como pendente.");
}

export async function processRefundAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("finance.manage");
  return runAction(async () => {
    await processRefund(admin.id, str(fd, "id"), { mode: str(fd, "mode") as "MANUAL", reference: optStr(fd, "reference"), notes: optStr(fd, "notes") });
    revalidatePath("/admin", "layout");
  }, "Reembolso atualizado.");
}

export async function createSettlementAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("finance.manage");
  return runAction(async () => {
    const end = str(fd, "periodEnd");
    await createSettlement(admin.id, str(fd, "restaurantId"), end ? new Date(`${end}T23:59:59`) : new Date(), optStr(fd, "notes"));
    revalidatePath("/admin/financeiro");
  }, "Liquidação criada.");
}

export async function settlementPaidAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("finance.manage");
  return runAction(async () => {
    await markSettlementPaid(admin.id, str(fd, "id"), str(fd, "reference"));
    revalidatePath("/admin/financeiro");
  }, "Liquidação marcada como paga.");
}

export async function settlementCancelAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("finance.manage");
  return runAction(async () => {
    await cancelSettlement(admin.id, str(fd, "id"));
    revalidatePath("/admin/financeiro");
  }, "Liquidação anulada.");
}

export async function courierPayoutAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("finance.manage");
  return runAction(async () => {
    await createCourierPayout(admin.id, str(fd, "courierId"), str(fd, "reference"));
    revalidatePath("/admin/financeiro");
    revalidatePath("/admin/entregadores", "layout");
  }, "Pagamento ao entregador registado.");
}

// ─────────────── Comissões ───────────────

export async function commissionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("commissions.manage");
  return runAction(async () => {
    await createCommissionRule(admin.id, {
      restaurantId: optStr(fd, "restaurantId"),
      percentageBps: pct(fd, "percentage"),
      fixedCents: money(fd, "fixed", false) ?? 0,
      effectiveFrom: (await date(fd, "effectiveFrom")) ?? new Date(),
      note: optStr(fd, "note"),
    });
    revalidatePath("/admin/comissoes");
    revalidatePath("/admin/restaurantes", "layout");
  }, "Regra de comissão criada.");
}

// ─────────────── Marketing ───────────────

export async function couponAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("marketing.manage");
  return runAction(async () => {
    const type = str(fd, "type") as "PERCENT" | "FIXED";
    await saveCoupon({ kind: "admin", userId: admin.id }, optStr(fd, "id"), {
      code: str(fd, "code"),
      description: optStr(fd, "description"),
      type,
      value: type === "PERCENT" ? pct(fd, "value") : money(fd, "value")!,
      maxDiscountCents: money(fd, "maxDiscount", false),
      minSubtotalCents: money(fd, "minSubtotal", false) ?? 0,
      startsAt: await date(fd, "startsAt"),
      endsAt: await date(fd, "endsAt"),
      usageLimitTotal: str(fd, "usageLimitTotal") ? int(fd, "usageLimitTotal") : null,
      usageLimitPerUser: str(fd, "usageLimitPerUser") ? int(fd, "usageLimitPerUser") : null,
      firstOrderOnly: bool(fd, "firstOrderOnly"),
      cityId: optStr(fd, "cityId"),
      restaurantIds: fd.getAll("restaurantIds").map(String).filter(Boolean),
      campaignId: optStr(fd, "campaignId"),
      fundedBy: (str(fd, "fundedBy") as "PLATFORM") || "PLATFORM",
      isActive: bool(fd, "isActive"),
    });
    revalidatePath("/admin/cupons");
  }, "Cupão guardado.");
}

export async function couponToggleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("marketing.manage");
  return runAction(async () => {
    await setCouponActive({ kind: "admin", userId: admin.id }, str(fd, "id"), bool(fd, "isActive"));
    revalidatePath("/admin/cupons");
  });
}

export async function campaignAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("marketing.manage");
  return runAction(async () => {
    await saveCampaign(admin.id, optStr(fd, "id"), {
      name: str(fd, "name"), description: optStr(fd, "description"), cityId: optStr(fd, "cityId"), restaurantId: optStr(fd, "restaurantId"),
      startsAt: await date(fd, "startsAt"), endsAt: await date(fd, "endsAt"), isActive: bool(fd, "isActive"),
    });
    revalidatePath("/admin/promocoes");
  }, "Campanha guardada.");
}

export async function bannerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("marketing.manage");
  return runAction(async () => {
    const img = file(fd, "image");
    const stored = img ? await storePublicImage(admin.id, img, "banner", 1600) : null;
    await saveBanner(admin.id, optStr(fd, "id"), {
      title: str(fd, "title"), subtitle: optStr(fd, "subtitle"), linkUrl: optStr(fd, "linkUrl"), cityId: optStr(fd, "cityId"),
      position: int(fd, "position"), isActive: bool(fd, "isActive"), startsAt: await date(fd, "startsAt"), endsAt: await date(fd, "endsAt"),
      imageFileId: stored ? stored.id : bool(fd, "removeImage") ? null : undefined,
    });
    revalidatePath("/admin/promocoes");
    revalidatePath("/");
  }, "Banner guardado.");
}

export async function deleteBannerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("marketing.manage");
  return runAction(async () => {
    await deleteBanner(admin.id, str(fd, "id"));
    revalidatePath("/admin/promocoes");
  }, "Banner removido.");
}

// ─────────────── Suporte ───────────────

export async function ticketReplyAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("support.manage");
  return runAction(async () => {
    await adminReplyTicket(admin.id, str(fd, "id"), {
      body: str(fd, "body"),
      isInternal: bool(fd, "isInternal"),
      status: (optStr(fd, "status") as TicketStatus) ?? undefined,
      priority: (optStr(fd, "priority") as TicketPriority) ?? undefined,
      assignToMe: bool(fd, "assignToMe"),
    });
    revalidatePath(`/admin/suporte/${str(fd, "id")}`);
  }, "Ticket atualizado.");
}

// ─────────────── Funcionários ───────────────

export async function staffAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("staff.manage");
  return runAction(async () => {
    await upsertStaff(admin.id, { email: str(fd, "email"), role: str(fd, "role") as StaffRole, name: optStr(fd, "name") ?? undefined, phone: optStr(fd, "phone") ?? undefined, password: optStr(fd, "password") ?? undefined });
    revalidatePath("/admin/funcionarios");
  }, "Funcionário guardado.");
}

export async function staffActiveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("staff.manage");
  return runAction(async () => {
    await setStaffActive(admin.id, str(fd, "id"), bool(fd, "isActive"));
    revalidatePath("/admin/funcionarios");
  }, "Funcionário atualizado.");
}

// ─────────────── Configurações ───────────────

export async function settingsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  return runAction(async () => {
    const section = str(fd, "section");
    if (section === "general") {
      await updateSettings(admin.id, {
        platformName: str(fd, "platformName"), tagline: optStr(fd, "tagline"), primaryColor: str(fd, "primaryColor"), accentColor: str(fd, "accentColor"),
        currency: str(fd, "currency").toUpperCase(), countryCode: str(fd, "countryCode").toUpperCase(), locale: str(fd, "locale"), timezone: str(fd, "timezone"),
        siteUrl: optStr(fd, "siteUrl") ?? "",
      });
      const logo = file(fd, "logo");
      if (logo) await setPlatformLogo(admin.id, (await storePublicImage(admin.id, logo, "platform_logo", 512)).id);
      if (bool(fd, "removeLogo")) await setPlatformLogo(admin.id, null);
    } else if (section === "contacts") {
      await updateSettings(admin.id, {
        supportEmail: optStr(fd, "supportEmail") ?? "", supportPhone: optStr(fd, "supportPhone"), whatsapp: optStr(fd, "whatsapp"),
        companyLegalName: optStr(fd, "companyLegalName"), companyAddress: optStr(fd, "companyAddress"),
      });
    } else if (section === "fees") {
      await updateSettings(admin.id, {
        serviceFeeBps: pct(fd, "serviceFeePct"), serviceFeeFixedCents: money(fd, "serviceFeeFixed", false) ?? 0, serviceFeeMaxCents: money(fd, "serviceFeeMax", false),
        defaultCommissionBps: pct(fd, "defaultCommissionPct"), courierFeeShareBps: pct(fd, "courierSharePct"), courierBaseFeeCents: money(fd, "courierBaseFee", false) ?? 0,
      });
    } else if (section === "rules") {
      await updateSettings(admin.id, {
        deliveryOfferTimeoutSec: int(fd, "deliveryOfferTimeoutSec", 90), paymentTimeoutMinutes: int(fd, "paymentTimeoutMinutes", 30),
        customerCancelWindow: str(fd, "customerCancelWindow") as "BEFORE_ACCEPT", cancellationPolicy: optStr(fd, "cancellationPolicy"),
        registrationOpen: bool(fd, "registrationOpen"), partnerSignupOpen: bool(fd, "partnerSignupOpen"), courierSignupOpen: bool(fd, "courierSignupOpen"),
        emailNotificationsOn: bool(fd, "emailNotificationsOn"),
      });
    } else if (section === "legal") {
      await updateSettings(admin.id, { termsContent: optStr(fd, "termsContent"), privacyContent: optStr(fd, "privacyContent") });
    } else throw new AppError("VALIDATION", "Secção inválida.");
    revalidatePath("/", "layout");
  }, "Configurações guardadas.");
}

export async function completeSetupAction(_: ActionResult): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  const r = await runAction(async () => {
    const cities = await db.city.count({ where: { isActive: true } });
    if (!cities) throw new AppError("VALIDATION", "Adicione pelo menos uma cidade atendida.");
    await completeSetup(admin.id);
  });
  if (r?.ok) redirect("/admin?configurado=1");
  return r;
}

export async function cityAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  return runAction(async () => {
    const city = await saveCity(admin.id, { id: optStr(fd, "id"), name: str(fd, "name"), isActive: fd.has("isActive") ? bool(fd, "isActive") : true });
    const nbs = str(fd, "neighborhoods");
    if (nbs) await addNeighborhoods(admin.id, city.id, nbs.split(/[\n,;]+/));
    revalidatePath("/admin/configuracoes", "layout");
  }, "Cidade guardada.");
}

export async function neighborhoodsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  return runAction(async () => {
    await addNeighborhoods(admin.id, str(fd, "cityId"), str(fd, "names").split(/[\n,;]+/));
    revalidatePath("/admin/configuracoes", "layout");
  }, "Bairros adicionados.");
}

export async function neighborhoodToggleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  return runAction(async () => {
    await setNeighborhoodActive(admin.id, str(fd, "id"), bool(fd, "isActive"));
    revalidatePath("/admin/configuracoes", "layout");
  });
}

export async function cuisineAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  return runAction(async () => {
    await saveCuisine(admin.id, { id: optStr(fd, "id"), name: str(fd, "name"), emoji: optStr(fd, "emoji"), isActive: fd.has("isActive") ? bool(fd, "isActive") : true, position: int(fd, "position") });
    revalidatePath("/admin/configuracoes", "layout");
  }, "Categoria guardada.");
}

export async function providerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("settings.manage");
  return runAction(async () => {
    await updateProviderConfig(admin.id, str(fd, "key") as "MPESA", {
      enabled: bool(fd, "enabled"), displayName: optStr(fd, "displayName") ?? undefined, instructions: optStr(fd, "instructions"), mode: (optStr(fd, "mode") as "SANDBOX") ?? undefined,
    });
    revalidatePath("/admin/configuracoes", "layout");
  }, "Método de pagamento atualizado.");
}


export async function assignOwnerAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("restaurants.manage");
  return runAction(async () => {
    const { adminAddRestaurantOwner } = await import("@/server/services/restaurants");
    await adminAddRestaurantOwner(admin.id, str(fd, "id"), str(fd, "email"));
    revalidatePath(`/admin/restaurantes/${str(fd, "id")}`);
  }, "Proprietário associado.");
}
