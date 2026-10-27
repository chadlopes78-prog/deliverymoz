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
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4">
          <span className="md:hidden"><Logo compact /></span>
          <span className="hidden md:block"><Logo /></span>
          <div className="min-w-0 flex-1 md:flex-none md:max-w-xs">
            <LocationButton geography={geography} location={location} />
          </div>
          <form action="/restaurantes" className="relative hidden flex-1 md:block" role="search">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" type="search" placeholder="Procurar restaurantes ou pratos" aria-label="Pesquisar" className="h-11 w-full rounded-full border border-line bg-bg pl-10 pr-4 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
          </form>
          <nav className="flex items-center gap-1" aria-label="Conta">
            {user ? (
              <>
                <Link href="/minha-conta/notificacoes" className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label={`Notificações${unread ? ` (${unread} por ler)` : ""}`}>
                  <Bell className="h-5 w-5" />
                  {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" />}
                </Link>
                <Link href="/minha-conta" className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-ink/5 md:flex">
                  <User className="h-5 w-5" /> {user.name.split(" ")[0]}
                </Link>
                {isAdminUser(user) && <Link href="/admin" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10 lg:block">Admin</Link>}
                {user.restaurantMembers.length > 0 && <Link href="/parceiro" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10 lg:block">Restaurante</Link>}
                {user.courier && <Link href="/entregador" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10 lg:block">Entregas</Link>}
              </>
            ) : (
              <Link href="/entrar" className="rounded-full px-3 py-2 text-sm font-semibold hover:bg-ink/5">Entrar</Link>
            )}
            <Link href="/sacola" className="relative hidden h-11 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-contrast md:flex" aria-label={`Sacola com ${count} itens`}>
              <ShoppingBag className="h-5 w-5" /> {count}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-12 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-muted">{settings.tagline || "Comida boa, entregue com cuidado."}</p>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Plataforma</h3>
            <ul className="space-y-2 text-muted">
              <li><Link className="hover:text-ink" href="/restaurantes">Restaurantes</Link></li>
              <li><Link className="hover:text-ink" href="/ajuda">Ajuda</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 font-semibold">Parcerias</h3>
            <ul className="space-y-2 text-muted">
              <li><Link className="hover:text-ink" href="/parceiro/registo">Registar o meu restaurante</Link></li>
              <li><Link className="hover:text-ink" href="/entregador/registo">Ser entregador</Link></li>
              <li><Link className="hover:text-ink" href="/admin/login" prefetch={false}>Acesso administrativo</Link></li>
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
        <p className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getFullYear()} {settings.companyLegalName || settings.platformName}</p>
      </footer>
      <BottomNav cartCount={count} />
    </div>
  );
}
