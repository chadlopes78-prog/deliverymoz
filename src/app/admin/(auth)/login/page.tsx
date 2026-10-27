import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Lock } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { isAdminUser } from "@/server/permissions";
import { ownerExists, ownerEmail } from "@/server/services/accounts";
import { getSettings } from "@/server/services/settings";
import { Logo } from "@/components/logo";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { adminLoginAction } from "@/app/admin/actions";
import { setupOwnerAction, activateOwnerAction } from "@/app/configuracao/actions";
import { logoutAction } from "@/app/(public)/actions";

export const metadata: Metadata = { title: "Entrar no painel" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getSessionUser();
  if (user && isAdminUser(user)) redirect(next?.startsWith("/admin") ? next : "/admin");
  const [hasOwner, settings] = await Promise.all([ownerExists(), getSettings()]);
  const tokenConfigured = (process.env.SETUP_TOKEN ?? "").length >= 16;
  const allowedEmail = ownerEmail();

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex justify-center"><Logo href="/" /></div>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><ShieldCheck className="h-6 w-6" /></span>
        {hasOwner ? (
          <>
            <h1 className="mt-4 text-2xl font-bold">Painel administrativo</h1>
            <p className="mt-1 text-sm text-muted">Acesso reservado ao proprietário e à equipa de {settings.platformName}.</p>
            {user && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Tem sessão iniciada como <strong>{user.name}</strong>, que não tem permissões administrativas. Entre com uma conta administrativa.</p>}
            <ActionForm action={adminLoginAction} className="mt-6 space-y-4">
              <input type="hidden" name="next" value={next ?? "/admin"} />
              <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="username" autoFocus /></Field>
              <Field label="Palavra-passe" htmlFor="password"><Input id="password" name="password" type="password" required autoComplete="current-password" /></Field>
              <div className="text-right text-sm"><Link href="/recuperar-password" className="font-semibold text-brand">Esqueceu a palavra-passe?</Link></div>
              <SubmitButton size="lg" className="w-full" pendingText="A verificar…"><Lock className="h-4 w-4" /> Entrar no painel</SubmitButton>
            </ActionForm>
          </>
        ) : user ? (
          <>
            <h1 className="mt-4 text-2xl font-bold">Ativar o painel de administração</h1>
            <p className="mt-1 text-sm text-muted">
              Tem sessão iniciada como <strong>{user.name}</strong> ({user.email}). Esta conta ainda não tem o papel de proprietário da plataforma, por isso o site mostra-lhe a área de compras.
            </p>
            {allowedEmail && user.email?.toLowerCase() !== allowedEmail ? (
              <>
                <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Esta conta não é a conta autorizada a ser proprietária da plataforma. Termine a sessão e entre com a conta correta.</p>
                <form action={logoutAction} className="mt-4"><button className="w-full rounded-xl border border-line px-4 py-3 text-sm font-semibold hover:bg-ink/5">Terminar sessão</button></form>
              </>
            ) : !tokenConfigured ? (
              <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Defina a variável de ambiente <code className="font-mono">SETUP_TOKEN</code> (mínimo 16 caracteres) no servidor e volte a publicar a aplicação.</p>
            ) : (
              <ActionForm action={activateOwnerAction} className="mt-6 space-y-4">
                <Field label="Código de configuração" htmlFor="setupToken" hint="Valor da variável SETUP_TOKEN definida na Vercel."><Input id="setupToken" name="setupToken" type="password" required autoComplete="off" /></Field>
                <Field label="Palavra-passe atual desta conta" htmlFor="password"><Input id="password" name="password" type="password" required autoComplete="current-password" /></Field>
                <SubmitButton size="lg" className="w-full" pendingText="A ativar…"><ShieldCheck className="h-4 w-4" /> Ativar e entrar no painel</SubmitButton>
              </ActionForm>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-bold">Criar a conta do proprietário</h1>
            <p className="mt-1 text-sm text-muted">Ainda não existe nenhuma conta administrativa. Este passo só está disponível uma vez e exige o código de configuração (variável <code className="font-mono">SETUP_TOKEN</code> definida no servidor).</p>
            {!tokenConfigured ? (
              <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Defina a variável de ambiente <code className="font-mono">SETUP_TOKEN</code> (mínimo 16 caracteres) no servidor e volte a publicar a aplicação.</p>
            ) : (
              <ActionForm action={setupOwnerAction} className="mt-6 space-y-4">
                <Field label="Código de configuração" htmlFor="setupToken"><Input id="setupToken" name="setupToken" type="password" required autoComplete="off" /></Field>
                <Field label="Nome" htmlFor="name"><Input id="name" name="name" required autoComplete="name" /></Field>
                <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required autoComplete="email" defaultValue={allowedEmail ?? undefined} /></Field>
                <Field label="Telefone" htmlFor="phone" hint="Número moçambicano, ex.: 84 123 4567"><Input id="phone" name="phone" type="tel" required autoComplete="tel" /></Field>
                <Field label="Palavra-passe" htmlFor="password" hint="Mínimo 12 caracteres, com letras e números."><Input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>
                <SubmitButton size="lg" className="w-full" pendingText="A criar…">Criar conta e entrar no painel</SubmitButton>
              </ActionForm>
            )}
          </>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-muted"><Link href="/" className="hover:text-ink">← Voltar ao site</Link></p>
    </div>
  );
}
