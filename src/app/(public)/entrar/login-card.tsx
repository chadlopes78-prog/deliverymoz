import Link from "next/link";
import { ShoppingBag, Store } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loginAction } from "../actions";
import type { LoginIntent } from "@/server/routing";

/** Formulário de entrada de compradores e parceiros. O destino final é decidido no servidor conforme as funções da conta. */
export function LoginCard({ intent, next }: { intent: LoginIntent; next?: string }) {
  const partner = intent === "parceiro";
  const Icon = partner ? Store : ShoppingBag;
  const registerHref = partner ? "/registar?perfil=parceiro" : `/registar${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Link href="/entrar" className="text-sm font-semibold text-muted hover:text-ink">← Escolher outro perfil</Link>
      <div className="mt-3 rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <span className={cn("grid h-12 w-12 place-items-center rounded-2xl", partner ? "bg-accent/10 text-accent" : "bg-brand/10 text-brand")}><Icon className="h-6 w-6" aria-hidden /></span>
        <h1 className="mt-4 text-2xl font-bold">{partner ? "Entrar como parceiro" : "Entrar como comprador"}</h1>
        <p className="mt-1 text-sm text-muted">{partner ? "Aceda ao painel do seu restaurante." : "Use o seu e-mail ou número de telefone."}</p>
        <ActionForm action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="intent" value={intent} />
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
        <p className="mt-6 text-center text-sm text-muted">
          {partner ? "Ainda não tem restaurante na plataforma?" : "Ainda não tem conta?"}{" "}
          <Link href={registerHref} className="font-semibold text-brand">{partner ? "Registar o meu restaurante" : "Criar conta"}</Link>
        </p>
      </div>
    </div>
  );
}
