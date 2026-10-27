import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShoppingBag, Store, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { destinationAfterLogin, safeNext } from "@/server/routing";
import { buttonClass } from "@/components/ui/button-class";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

/** Escolha do perfil. Quem chega com um destino (ex.: checkout ou painel do restaurante) vai diretamente para o formulário certo. */
export default async function ChooseProfile({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = next ? safeNext(next) : null;
  const user = await getSessionUser();
  if (user) redirect(await destinationAfterLogin(user.id, target?.startsWith("/parceiro") ? "parceiro" : "comprador", target));
  if (target && target !== "/") redirect(`${target.startsWith("/parceiro") ? "/entrar/parceiro" : "/entrar/comprador"}?next=${encodeURIComponent(target)}`);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Bem-vindo ao DeliveryMoz</h1>
        <p className="mt-2 text-muted">Escolhe como queres utilizar a plataforma.</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-8" aria-labelledby="perfil-comprador">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><ShoppingBag className="h-7 w-7" aria-hidden /></span>
          <h2 id="perfil-comprador" className="mt-5 text-xl font-bold">Quero fazer pedidos</h2>
          <p className="mt-2 flex-1 text-sm text-muted">Descobre restaurantes, explora menus e encomenda as tuas refeições.</p>
          <Link href="/entrar/comprador" className={buttonClass("primary", "lg", "mt-6 w-full whitespace-normal text-center")}>Entrar como comprador <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/registar" className="mt-3 text-center text-sm font-semibold text-brand">Criar conta de comprador</Link>
        </section>
        <section className="flex flex-col rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-8" aria-labelledby="perfil-parceiro">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Store className="h-7 w-7" aria-hidden /></span>
          <h2 id="perfil-parceiro" className="mt-5 text-xl font-bold">Tenho um restaurante</h2>
          <p className="mt-2 flex-1 text-sm text-muted">Regista o teu negócio, publica os teus produtos e gere os teus pedidos.</p>
          <Link href="/entrar/parceiro" className={buttonClass("accent", "lg", "mt-6 w-full whitespace-normal text-center")}>Entrar como parceiro <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/parceiro/registo" className="mt-3 text-center text-sm font-semibold text-accent">Registar um restaurante</Link>
        </section>
      </div>
    </div>
  );
}
