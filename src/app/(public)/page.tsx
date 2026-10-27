import Link from "next/link";
import { Search, Store, ChevronRight, MapPin, UtensilsCrossed, PackageCheck, ChefHat, ClipboardList, BarChart3, Receipt, ArrowRight } from "lucide-react";
import { getCustomerLocation, getGeography } from "@/server/location";
import { getSessionUser } from "@/server/auth/session";
import { listRestaurants, activeBanners, cuisinesWithRestaurants, availableProducts, reorderRestaurantIds, type RestaurantListItem } from "@/server/services/catalog";
import { getSettings } from "@/server/services/settings";
import { db } from "@/server/db";
import { RestaurantCard } from "@/components/public/restaurant-card";
import { LocationButton } from "@/components/public/location-button";
import { HeroFoodArt } from "@/components/public/food-art";
import { buttonClass } from "@/components/ui/button-class";
import { OrderStatusBadge, formatDate } from "@/components/status";
import { formatMoney } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";

export default async function HomePage() {
  const [settings, location, geography, user] = await Promise.all([getSettings(), getCustomerLocation(), getGeography(), getSessionUser()]);
  const filters = { cityId: location?.cityId, neighborhoodId: location?.neighborhoodId };
  const [all, banners, cuisines] = await Promise.all([listRestaurants({ ...filters, take: 60 }), activeBanners(location?.cityId), cuisinesWithRestaurants(location?.cityId)]);
  const [products, recentOrders, reorderIds] = await Promise.all([
    availableProducts(all.filter((r) => r.availability.orderable).map((r) => r.id), 12),
    user ? db.order.findMany({ where: { customerId: user.id }, orderBy: { createdAt: "desc" }, take: 3, include: { restaurant: { select: { name: true } } } }) : [],
    user ? reorderRestaurantIds(user.id) : [],
  ]);
  const cur = settings.currency;
  const featured = all.filter((r) => r.isFeatured);
  const promos = all.filter((r) => r.hasPromo);
  const fast = all.filter((r) => r.availability.orderable).sort((a, b) => a.etaMinutes - b.etaMinutes).slice(0, 12);
  const reorder = reorderIds.map((id) => all.find((r) => r.id === id)).filter((r): r is RestaurantListItem => !!r);
  const firstName = user?.name.split(" ")[0];

  return (
    <div>
      {user ? (
        /* Área do comprador */
        <section className="border-b border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
            <p className="text-sm font-semibold text-brand">Olá, {firstName}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">O que vai ser hoje?</h1>
            <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1.4fr]">
              <LocationButton geography={geography} location={location} variant="hero" />
              <SearchBox />
            </div>
          </div>
        </section>
      ) : (
        /* Apresentação para visitantes */
        <section className="overflow-hidden border-b border-line bg-gradient-to-b from-surface to-bg">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:py-16">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
                <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden /> Delivery de comida em Moçambique
              </p>
              <h1 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                Os restaurantes da tua cidade, <span className="text-brand">entregues à tua porta.</span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
                {settings.tagline || "Escolhe a tua localização, explora os menus dos restaurantes locais e encomenda em poucos toques. Pagas em meticais."}
              </p>
              <div className="mt-6 grid max-w-xl gap-3">
                <LocationButton geography={geography} location={location} variant="hero" />
                <SearchBox />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/restaurantes" className={buttonClass("primary", "lg")}>Explorar restaurantes <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/parceiro/registo" className={buttonClass("outline", "lg")}><Store className="h-4 w-4" /> Tenho um restaurante</Link>
              </div>
            </div>
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <HeroFoodArt className="h-auto w-full" />
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-7xl px-4">
        {recentOrders.length > 0 && (
          <section className="mt-8" aria-labelledby="pedidos-recentes">
            <SectionTitle id="pedidos-recentes" title="Os teus pedidos recentes" href="/minha-conta/pedidos" />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/acompanhar/${o.code}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-brand">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Receipt className="h-5 w-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{o.restaurant.name}</span>
                      <span className="block text-xs text-muted">#{o.code} · {formatDate(o.createdAt)} · {formatMoney(o.totalCents, o.currency)}</span>
                    </span>
                    <OrderStatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {cuisines.length > 0 && (
          <section className="mt-8" aria-labelledby="categorias">
            <SectionTitle id="categorias" title="Categorias" />
            <nav className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Categorias">
              {cuisines.map((c) => (
                <Link key={c.id} href={`/restaurantes?categoria=${c.slug}`} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:border-brand hover:text-brand">
                  {c.emoji && <span aria-hidden>{c.emoji}</span>}{c.name}
                </Link>
              ))}
            </nav>
          </section>
        )}

        {banners.length > 0 && (
          <section className="scrollbar-none -mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4" aria-label="Promoções">
            {banners.map((b) => {
              const inner = (
                <div className="relative flex h-36 w-[85vw] max-w-md shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl bg-accent p-5 text-white sm:h-44">
                  {b.imageFileId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(b.imageFileId)!} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="relative">
                    <p className="text-lg font-bold leading-tight">{b.title}</p>
                    {b.subtitle && <p className="text-sm opacity-90">{b.subtitle}</p>}
                  </div>
                </div>
              );
              return b.linkUrl ? <Link key={b.id} href={b.linkUrl}>{inner}</Link> : <div key={b.id}>{inner}</div>;
            })}
          </section>
        )}

        {all.length === 0 ? (
          <section className="mt-8 grid gap-6 rounded-3xl border border-dashed border-line bg-surface px-5 py-10 text-center sm:px-10" aria-labelledby="sem-restaurantes">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Store className="h-7 w-7" aria-hidden /></span>
            <div>
              <h2 id="sem-restaurantes" className="text-lg font-bold">Ainda não existem restaurantes disponíveis nesta região.</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
                {location ? `Ainda nenhum restaurante entrega em ${location.neighborhoodName ?? location.cityName}. Experimenta outra localização ou volta em breve.` : "Escolhe a tua localização para veres os restaurantes que entregam aí."}
              </p>
            </div>
            <div className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
              <div className="sm:min-w-56"><LocationButton geography={geography} location={location} variant="hero" /></div>
              <Link href="/parceiro/registo" className={buttonClass("outline", "lg")}>Registar o meu restaurante</Link>
            </div>
          </section>
        ) : (
          <>
            {reorder.length > 0 && <Carousel title="Peça de novo" items={reorder} currency={cur} />}
            <Carousel title="Em destaque" items={featured} currency={cur} />
            <Carousel title="Com promoções" items={promos} currency={cur} href="/restaurantes?promo=1" />
            <Carousel title="Entrega mais rápida" items={fast} currency={cur} href="/restaurantes?ordenar=eta" />

            {products.length > 0 && (
              <section className="mt-10" aria-labelledby="pratos">
                <SectionTitle id="pratos" title="Pratos disponíveis agora" href="/restaurantes" />
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {products.map((p) => (
                    <li key={p.id}>
                      <Link href={`/restaurante/${p.restaurant.slug}/${p.slug}`} className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface hover:border-brand">
                        <div className="aspect-[4/3] bg-ink/5">
                          {p.imageFileId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={fileUrl(p.imageFileId)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : <span className="grid h-full place-items-center text-muted"><UtensilsCrossed className="h-8 w-8" aria-hidden /></span>}
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-semibold group-hover:text-brand">{p.name}</p>
                          <p className="truncate text-xs text-muted">{p.restaurant.name}</p>
                          <p className="mt-1 text-sm font-bold tabular-nums">{formatMoney(p.priceCents, cur)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10" aria-labelledby="restaurantes">
              <SectionTitle id="restaurantes" title={location?.neighborhoodName ? `Restaurantes que entregam em ${location.neighborhoodName}` : "Restaurantes disponíveis"} href="/restaurantes" />
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {all.map((r) => <RestaurantCard key={r.id} r={r} currency={cur} />)}
              </div>
            </section>
          </>
        )}

        {!user && (
          <>
            <section id="como-funciona" className="mt-14 scroll-mt-24" aria-labelledby="como-funciona-t">
              <h2 id="como-funciona-t" className="text-2xl font-extrabold tracking-tight">Como funciona</h2>
              <p className="mt-1 text-muted">Três passos entre a fome e a refeição.</p>
              <ol className="mt-6 grid gap-4 sm:grid-cols-3">
                {[
                  { icon: MapPin, title: "Escolhe onde estás", text: "Indica a cidade e o bairro para veres os restaurantes que entregam aí." },
                  { icon: UtensilsCrossed, title: "Explora e encomenda", text: "Vê menus, fotografias e preços em MZN. Paga na entrega ou pelos métodos disponíveis." },
                  { icon: PackageCheck, title: "Acompanha o pedido", text: "Recebe as atualizações de estado do pedido até chegar à tua porta." },
                ].map((s, i) => (
                  <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                    <span className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-brand-contrast"><s.icon className="h-5 w-5" aria-hidden /></span>
                      <span className="text-sm font-bold text-muted">Passo {i + 1}</span>
                    </span>
                    <h3 className="mt-4 font-bold">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted">{s.text}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section id="parceiros" className="mt-14 scroll-mt-24 overflow-hidden rounded-3xl bg-[#12141a] text-white" aria-labelledby="parceiros-t">
              <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/60">Para restaurantes</p>
                  <h2 id="parceiros-t" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Leva o teu restaurante a mais clientes.</h2>
                  <p className="mt-3 max-w-xl text-white/75">Regista o teu negócio, publica o menu com fotografias e preços e gere os pedidos num painel feito para restaurantes.</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/parceiro/registo" className={buttonClass("primary", "lg")}>Registar o meu restaurante</Link>
                    <Link href="/entrar/parceiro" className="inline-flex h-12 items-center rounded-xl border border-white/25 px-5 text-sm font-semibold hover:bg-white/10">Entrar como parceiro</Link>
                  </div>
                </div>
                <ul className="grid gap-3">
                  {[
                    { icon: ChefHat, title: "Menu sempre atualizado", text: "Produtos, variantes, complementos, preços e disponibilidade." },
                    { icon: ClipboardList, title: "Pedidos organizados", text: "Novos, em preparação e prontos, com alertas e histórico." },
                    { icon: BarChart3, title: "Vendas e relatórios", text: "Indicadores calculados a partir dos teus pedidos." },
                  ].map((f) => (
                    <li key={f.title} className="flex gap-3 rounded-2xl bg-white/5 p-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-contrast"><f.icon className="h-5 w-5" aria-hidden /></span>
                      <span><span className="block font-semibold">{f.title}</span><span className="block text-sm text-white/70">{f.text}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SearchBox() {
  return (
    <form action="/restaurantes" className="relative" role="search">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
      <input name="q" type="search" placeholder="Pratos, restaurantes, tipos de comida" aria-label="Pesquisar restaurantes e pratos" className="h-full min-h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-4 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
    </form>
  );
}

function SectionTitle({ title, href, id }: { title: string; href?: string; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-lg font-bold sm:text-xl">{title}</h2>
      {href && <Link href={href} className="flex shrink-0 items-center text-sm font-semibold text-brand">Ver todos <ChevronRight className="h-4 w-4" /></Link>}
    </div>
  );
}

function Carousel({ title, items, currency, href }: { title: string; items: RestaurantListItem[]; currency: string; href?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-10">
      <SectionTitle title={title} href={href} />
      <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {items.map((r) => <RestaurantCard key={r.id} r={r} currency={currency} layout="tile" />)}
      </div>
    </section>
  );
}
