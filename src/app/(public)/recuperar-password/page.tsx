import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { forgotPasswordAction, resetPasswordAction } from "../actions";
import { emailConfigured } from "@/server/email";

export const metadata: Metadata = { title: "Recuperar palavra-passe", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        {token ? (
          <>
            <h1 className="text-2xl font-bold">Nova palavra-passe</h1>
            <ActionForm action={resetPasswordAction} className="mt-6 space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field label="Nova palavra-passe" htmlFor="password" hint="Mínimo 8 caracteres, com letras e números."><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
              <Field label="Confirmar" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></Field>
              <SubmitButton size="lg" className="w-full">Guardar palavra-passe</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Recuperar palavra-passe</h1>
            <p className="mt-1 text-sm text-muted">Indique o e-mail da sua conta. Enviaremos um link válido durante 1 hora.</p>
            {!emailConfigured() && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">O envio de e-mails ainda não está configurado nesta plataforma. Contacte o suporte para recuperar o acesso.</p>}
            <ActionForm action={forgotPasswordAction} className="mt-6 space-y-4" resetOnSuccess>
              <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
              <SubmitButton size="lg" className="w-full">Enviar instruções</SubmitButton>
            </ActionForm>
          </>
        )}
      </div>
    </div>
  );
}
