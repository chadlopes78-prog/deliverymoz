import Link from "next/link";
import { Search, Store, ChevronRight } from "lucide-react";
import { getCustomerLocation, getGeography } from "@/server/location";
import { listRestaurants, activeBanners, cuisinesWithRestaurants, type RestaurantListItem } from "@/server/services/catalog";
import { getSettings } from "@/server/services/settings";
import { RestaurantCard } from "@/components/public/restaurant-card";
import { LocationButton } from "@/components/public/location-button";
import { EmptyState } from "@/components/ui/empty-state";
import { fileUrl } from "@/server/storage/files";

export default async function HomePage() {
  const [settings, location, geography] = await Promise.all([getSettings(), getCustomerLocation(), getGeography()]);
  const filters = { cityId: location?.cityId, neighborhoodId: location?.neighborhoodId };
  const [all, banners, cuisines] = await Promise.all([listRestaurants({ ...filters, take: 60 }), activeBanners(location?.cityId), cuisinesWithRestaurants(location?.cityId)]);
  const featured = all.filter((r) => r.isFeatured);
  const rated = all.filter((r) => r.ratingCount > 0).sort((a, b) => b.ratingAvg - a.ratingAvg).slice(0, 12);
  const fast = all.filter((r) => r.availability.orderable).sort((a, b) => a.etaMinutes - b.etaMinutes).slice(0, 12);
  const promos = all.filter((r) => r.hasPromo);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-8">
      <section className="rounded-3xl bg-gradient-to-br from-brand to-[color-mix(in_srgb,var(--brand)_70%,#000)] px-5 py-7 text-brand-contrast sm:px-10 sm:py-12">
        <h1 className="max-w-xl text-2xl font-extrabold leading-tight sm:text-4xl">{settings.tagline || "O que vai ser hoje?"}</h1>
        <p className="mt-2 max-w-lg text-sm opacity-90 sm:text-base">Descubra os restaurantes que entregam onde está.</p>
        <div className="mt-5 grid max-w-2xl gap-3 text-ink sm:grid-cols-[1fr_1.4fr]">
          <LocationButton geography={geography} location={location} variant="hero" />
          <form action="/restaurantes" className="relative" role="search">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" type="search" placeholder="Pratos, restaurantes, tipos de comida" aria-label="Pesquisar" className="h-full min-h-14 w-full rounded-2xl bg-surface pl-12 pr-4 text-sm shadow-sm ring-1 ring-line focus:outline-none focus:ring-4 focus:ring-white/40" />
          </form>
        </div>
      </section>

      {cuisines.length > 0 && (
        <nav className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4" aria-label="Categorias">
          {cuisines.map((c) => (
            <Link key={c.id} href={`/restaurantes?categoria=${c.slug}`} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-brand hover:text-brand">
              {c.emoji && <span aria-hidden>{c.emoji}</span>}{c.name}
            </Link>
          ))}
        </nav>
      )}

      {banners.length > 0 && (
        <section className="scrollbar-none -mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4" aria-label="Destaques">
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
        <EmptyState
          className="mt-8"
          icon={Store}
          title="Ainda não existem restaurantes disponíveis nesta região."
          description={location ? "Estamos a preparar novidades para ti. Experimente escolher outro bairro ou volte em breve." : "Estamos a preparar novidades para ti. Escolha a sua localização para ver os restaurantes que entregam aí."}
        />
      ) : (
        <>
          <Carousel title="Em destaque" items={featured} currency={settings.currency} />
          <Carousel title="Com promoções" items={promos} currency={settings.currency} href="/restaurantes?promo=1" />
          <Carousel title="Entrega mais rápida" items={fast} currency={settings.currency} href="/restaurantes?ordenar=eta" />
          <Carousel title="Mais bem avaliados" items={rated} currency={settings.currency} href="/restaurantes?ordenar=rating" />
          <section className="mt-8">
            <SectionTitle title={location?.neighborhoodName ? `Restaurantes que entregam em ${location.neighborhoodName}` : "Restaurantes disponíveis"} href="/restaurantes" />
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {all.map((r) => (
                <RestaurantCard key={r.id} r={r} currency={settings.currency} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
      {href && <Link href={href} className="flex items-center text-sm font-semibold text-brand">Ver todos <ChevronRight className="h-4 w-4" /></Link>}
    </div>
  );
}

function Carousel({ title, items, currency, href }: { title: string; items: RestaurantListItem[]; currency: string; href?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <SectionTitle title={title} href={href} />
      <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {items.map((r) => (
          <RestaurantCard key={r.id} r={r} currency={currency} layout="tile" />
        ))}
      </div>
    </section>
  );
}
