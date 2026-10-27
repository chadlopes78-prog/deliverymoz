import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { destinationAfterLogin, safeNext } from "@/server/routing";
import { LoginCard } from "../login-card";

export const metadata: Metadata = { title: "Entrar como parceiro", robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(await destinationAfterLogin(user.id, "parceiro", next ? safeNext(next) : null));
  return <LoginCard intent="parceiro" next={next ? safeNext(next) : undefined} />;
}
