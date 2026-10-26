import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { registerAction } from "../actions";

export const metadata: Metadata = { title: "Criar conta", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect("/");
  const settings = await getSettings();
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Criar conta</h1>
        {!settings.registrationOpen ? (
          <p className="mt-4 text-sm text-muted">O registo de novas contas está temporariamente fechado.</p>
        ) : (
          <ActionForm action={registerAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={next ?? "/"} />
            <Field label="Nome completo" htmlFor="name"><Input id="name" name="name" required minLength={2} autoComplete="name" /></Field>
            <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Telefone" htmlFor="phone" hint="Número moçambicano, ex.: 84 123 4567"><Input id="phone" name="phone" type="tel" inputMode="tel" required autoComplete="tel" /></Field>
            <Field label="Palavra-passe" htmlFor="password" hint="Mínimo 8 caracteres, com letras e números."><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
            <Checkbox name="accept" required label={<>Li e aceito os <Link href="/termos" className="font-semibold text-brand" target="_blank">termos de utilização</Link> e a <Link href="/privacidade" className="font-semibold text-brand" target="_blank">política de privacidade</Link>.</>} />
            <SubmitButton size="lg" className="w-full" pendingText="A criar conta…">Criar conta</SubmitButton>
          </ActionForm>
        )}
        <p className="mt-6 text-center text-sm text-muted">Já tem conta? <Link href="/entrar" className="font-semibold text-brand">Entrar</Link></p>
      </div>
    </div>
  );
}
