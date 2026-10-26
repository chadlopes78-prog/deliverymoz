import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { ownerExists } from "@/server/services/accounts";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { setupOwnerAction } from "./actions";

export const metadata: Metadata = { title: "Configuração inicial", robots: { index: false } };

export default async function SetupPage() {
  if (await ownerExists()) redirect("/admin/configuracoes/inicial");
  const tokenConfigured = (process.env.SETUP_TOKEN ?? "").length >= 16;
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><ShieldCheck className="h-6 w-6" /></span>
        <h1 className="mt-4 text-2xl font-bold">Criar a conta do proprietário</h1>
        <p className="mt-1 text-sm text-muted">Este passo só está disponível uma vez, enquanto não existir um Super Admin. É necessário o código de configuração (SETUP_TOKEN) definido no servidor.</p>
        {!tokenConfigured ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Defina a variável de ambiente <code className="font-mono">SETUP_TOKEN</code> (mínimo 16 caracteres) e reinicie a aplicação. Alternativamente, use o comando <code className="font-mono">npm run owner:create</code>.</p>
        ) : (
          <ActionForm action={setupOwnerAction} className="mt-6 space-y-4">
            <Field label="Código de configuração" htmlFor="setupToken"><Input id="setupToken" name="setupToken" type="password" required autoComplete="off" /></Field>
            <Field label="Nome" htmlFor="name"><Input id="name" name="name" required autoComplete="name" /></Field>
            <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" required autoComplete="tel" /></Field>
            <Field label="Palavra-passe" htmlFor="password" hint="Mínimo 12 caracteres, com letras e números."><Input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>
            <SubmitButton size="lg" className="w-full">Criar conta do proprietário</SubmitButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
