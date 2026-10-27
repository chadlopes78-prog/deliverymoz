import Link from "next/link";
import { ShoppingBag, Search, User, Bell } from "lucide-react";
import { Logo } from "@/components/logo";
import { LocationButton } from "@/components/public/location-button";
import { BottomNav } from "@/components/public/bottom-nav";
import { getSessionUser } from "@/server/auth/session";
import { getCustomerLocation, getGeography } from "@/server/location";
import { getCartRef } from "@/server/cart-ref";
import { cartCount } from "@/server/services/cart";
import { getSettings } from "@/server/services/settings";
import { db } from "@/server/db";
import { isAdminUser } from "@/server/permissions";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [user, location, geography, settings] = await Promise.all([getSessionUser(), getCustomerLocation(), getGeography(), getSettings()]);
  const count = await cartCount(await getCartRef());
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }) : 0;
  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3">
          <span className="sm:hidden"><Logo compact /></span>
          <span className="hidden sm:block"><Logo /></span>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Principal">
            {[["/", "Início"], ["/restaurantes", "Explorar restaurantes"], ...(user ? [] : [["/#como-funciona", "Como funciona"]]), [user?.restaurantMembers.length ? "/parceiro" : "/#parceiros", "Para restaurantes"]].map(([href, label]) => (
              <Link key={label} href={href} className="rounded-full px-3 py-2 text-sm font-semibold text-ink/75 hover:bg-ink/5 hover:text-ink">{label}</Link>
            ))}
          </nav>
          <div className="min-w-0 flex-1 md:ml-auto md:max-w-xs md:flex-none">
            <LocationButton geography={geography} location={location} />
          </div>
          <nav className="flex shrink-0 items-center gap-1" aria-label="Conta">
            <Link href="/restaurantes" className="hidden h-10 w-10 place-items-center rounded-full hover:bg-ink/5 md:grid" aria-label="Pesquisar"><Search className="h-5 w-5" /></Link>
            {user ? (
              <>
                <Link href="/minha-conta/notificacoes" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label={`Notificações${unread ? ` (${unread} por ler)` : ""}`}>
                  <Bell className="h-5 w-5" />
                  {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" />}
                </Link>
                {isAdminUser(user) && <Link href="/admin" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10 xl:block">Centro de controlo</Link>}
                {user.restaurantMembers.length > 0 && <Link href="/parceiro" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10 xl:block">Meu restaurante</Link>}
                {user.courier && <Link href="/entregador" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10 xl:block">Entregas</Link>}
                <Link href="/minha-conta" className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-ink/5 md:flex">
                  <User className="h-5 w-5" /> {user.name.split(" ")[0]}
                </Link>
              </>
            ) : (
              <>
                <Link href="/entrar" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-ink/5">Entrar</Link>
                <Link href="/registar" className="hidden h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-brand hover:text-brand sm:flex">Criar conta</Link>
              </>
            )}
            <Link href="/sacola" className="relative hidden h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-contrast md:flex" aria-label={`Sacola com ${count} itens`}>
              <ShoppingBag className="h-5 w-5" /> {count}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-muted">{settings.tagline || "Restaurantes locais, entregues à tua porta."}</p>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Plataforma</h3>
            <ul className="space-y-2 text-muted">
              <li><Link className="hover:text-ink" href="/restaurantes">Explorar restaurantes</Link></li>
              <li><Link className="hover:text-ink" href="/#como-funciona">Como funciona</Link></li>
              <li><Link className="hover:text-ink" href="/ajuda">Ajuda e suporte</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Parceiros</h3>
            <ul className="space-y-2 text-muted">
              <li><Link className="hover:text-ink" href="/parceiro/registo">Registar o meu restaurante</Link></li>
              <li><Link className="hover:text-ink" href="/entrar/parceiro">Entrar como parceiro</Link></li>
              <li><Link className="hover:text-ink" href="/entregador/registo">Ser entregador</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Legal e contactos</h3>
            <ul className="space-y-2 text-muted">
              <li><Link className="hover:text-ink" href="/termos">Termos de utilização</Link></li>
              <li><Link className="hover:text-ink" href="/privacidade">Política de privacidade</Link></li>
              {settings.supportEmail && <li><a className="hover:text-ink" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></li>}
              {settings.supportPhone && <li><a className="hover:text-ink" href={`tel:${settings.supportPhone.replace(/\s/g, "")}`}>{settings.supportPhone}</a></li>}
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted">
            <p>© {new Date().getFullYear()} {settings.companyLegalName || settings.platformName}</p>
            <Link href="/admin/login" prefetch={false} className="hover:text-ink">Administração</Link>
          </div>
        </div>
      </footer>
      <BottomNav cartCount={count} />
    </div>
  );
}
