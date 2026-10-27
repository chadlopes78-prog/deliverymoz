import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { randomToken, sha256 } from "./tokens";
import { requestInfo } from "../request";

export const SESSION_COOKIE = "dm_session";
const SESSION_DAYS = 30;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const { ip, userAgent } = await requestInfo();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt, ip, userAgent } });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string, exceptCurrent = false) {
  let keep: string | undefined;
  if (exceptCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    keep = token ? sha256(token) : undefined;
  }
  await db.session.deleteMany({ where: { userId, ...(keep ? { NOT: { id: keep } } : {}) } });
}

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  isSuperAdmin: true,
  staff: { select: { role: true, isActive: true, permissions: true } },
  courier: { select: { id: true, status: true } },
  restaurantMembers: {
    where: { isActive: true },
    select: { restaurantId: true, role: true, restaurant: { select: { name: true, status: true } } },
  },
} as const;

/** Utilizador da sessão atual (memoizado por pedido). Devolve null se não houver sessão válida. */
export const getSessionUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: sessionUserSelect } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
    });
  }
  return session.user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
