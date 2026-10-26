import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-sm text-muted">Use o seu e-mail ou número de telefone.</p>
        <ActionForm action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field label="E-mail ou telefone" htmlFor="identifier">
            <Input id="identifier" name="identifier" required autoComplete="username" />
          </Field>
          <Field label="Palavra-passe" htmlFor="password">
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </Field>
          <div className="text-right text-sm"><Link href="/recuperar-password" className="font-semibold text-brand">Esqueceu a palavra-passe?</Link></div>
          <SubmitButton size="lg" className="w-full" pendingText="A entrar…">Entrar</SubmitButton>
        </ActionForm>
        <p className="mt-6 text-center text-sm text-muted">Ainda não tem conta? <Link href={`/registar${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand">Criar conta</Link></p>
      </div>
    </div>
  );
}
