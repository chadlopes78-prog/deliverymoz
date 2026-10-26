import "server-only";
import { cookies } from "next/headers";
import { getSessionUser } from "./auth/session";
import { randomToken, sha256 } from "./auth/tokens";
import type { CartRef } from "./services/cart";

export const CART_COOKIE = "dm_cart";

/** Identifica a sacola: do utilizador autenticado ou anónima (cookie). */
export async function getCartRef(create = false): Promise<CartRef> {
  const user = await getSessionUser();
  if (user) return { userId: user.id };
  const jar = await cookies();
  let token = jar.get(CART_COOKIE)?.value;
  if (!token && create) {
    token = randomToken(24);
    jar.set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return token ? { tokenHash: sha256(token) } : {};
}
