import { db } from "../db";
import { sendEmail, simpleEmailHtml } from "../email";
import { getSettingsUncached } from "./settings";
import { logError } from "../audit";

export type NotifyInput = {
  type: string;
  title: string;
  body: string;
  link?: string;
  /** "order" respeita a preferência de e-mail de pedidos; "account" é sempre enviado (ex.: recuperação de conta). */
  email?: "order" | "account" | "marketing" | false;
};

function absoluteUrl(path: string, siteUrl?: string | null) {
  const base = siteUrl || process.env.APP_URL || "http://localhost:3000";
  return new URL(path, base).toString();
}

/** Cria notificações dentro do site e, quando aplicável e configurado, envia e-mail. Nunca lança erro. */
export async function notifyUsers(userIds: string[], n: NotifyInput) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const users = await db.user.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
      select: { id: true, email: true, notifyInApp: true, notifyEmailOrders: true, notifyEmailMarketing: true },
    });
    await db.notification.createMany({
      data: users
        .filter((u) => u.notifyInApp || n.email === "account")
        .map((u) => ({ userId: u.id, type: n.type, title: n.title, body: n.body, link: n.link })),
    });
    if (!n.email) return;
    const settings = await getSettingsUncached();
    if (!settings.emailNotificationsOn && n.email !== "account") return;
    for (const u of users) {
      if (!u.email) continue;
      if (n.email === "order" && !u.notifyEmailOrders) continue;
      if (n.email === "marketing" && !u.notifyEmailMarketing) continue;
      await sendEmail(
        u.email,
        `${settings.platformName}: ${n.title}`,
        simpleEmailHtml(n.title, n.body, n.link ? { url: absoluteUrl(n.link, settings.siteUrl), label: "Ver detalhes" } : undefined),
      );
    }
  } catch (e) {
    await logError("notifications", e, { type: n.type });
  }
}

export async function restaurantUserIds(restaurantId: string, roles?: ("OWNER" | "MANAGER" | "ORDER_OPERATOR")[]) {
  const members = await db.restaurantMember.findMany({
    where: { restaurantId, isActive: true, ...(roles ? { role: { in: roles } } : {}) },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function adminUserIds(roles: ("OPERATIONS" | "FINANCE" | "SUPPORT" | "RESTAURANT_MANAGEMENT")[] = []) {
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ isSuperAdmin: true }, ...(roles.length ? [{ staff: { isActive: true, role: { in: roles } } }] : [])],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
