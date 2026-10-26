import Link from "next/link";
import type { Metadata } from "next";
import { Store, SearchX } from "lucide-react";
import { getCustomerLocation } from "@/server/location";
import { listRestaurants, searchProducts, cuisinesWithRestaurants } from "@/server/services/catalog";
import { getSettings } from "@/server/services/settings";
import { RestaurantCard } from "@/components/public/restaurant-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";

export const metadata: Metadata = { title: "Restaurantes", description: "Procure restaurantes e pratos disponíveis na sua zona." };

type SP = { q?: string; categoria?: string; ordenar?: string; abertos?: string; promo?: string; taxa?: string; nota?: string };

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [settings, location] = await Promise.all([getSettings(), getCustomerLocation()]);
  const q = sp.q?.trim().slice(0, 80) || null;
  const [list, products, cuisines] = await Promise.all([
    listRestaurants({
      cityId: location?.cityId,
      neighborhoodId: location?.neighborhoodId,
      q,
      cuisine: sp.categoria || null,
      sort: (sp.ordenar as "rating") || null,
      openOnly: sp.abertos === "1",
      promoOnly: sp.promo === "1",
      maxFeeCents: sp.taxa ? parseMoneyToCents(sp.taxa) : null,
      minRating: sp.nota ? Number(sp.nota) : null,
    }),
    q ? searchProducts(q, location?.cityId) : Promise.resolve([]),
    cuisinesWithRestaurants(location?.cityId),
  ]);
  const hasFilters = !!(q || sp.categoria || sp.abertos || sp.promo || sp.taxa || sp.nota);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">{q ? `Resultados para “${q}”` : "Restaurantes"}</h1>
      {location && <p className="mt-1 text-sm text-muted">{location.neighborhoodName ? `A entregar em ${location.neighborhoodName}, ${location.cityName}` : location.cityName}</p>}

      <form className="mt-4 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <input name="q" defaultValue={q ?? ""} type="search" placeholder="Pesquisar" aria-label="Pesquisar" className="h-11 rounded-xl border border-line px-3 text-sm lg:col-span-2" />
        <Select name="categoria" defaultValue={sp.categoria ?? ""} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cuisines.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
        <Select name="ordenar" defaultValue={sp.ordenar ?? ""} aria-label="Ordenar">
          <option value="">Relevância</option>
          <option value="rating">Melhor avaliação</option>
          <option value="fee">Menor taxa de entrega</option>
          <option value="eta">Entrega mais rápida</option>
        </Select>
        <Select name="nota" defaultValue={sp.nota ?? ""} aria-label="Avaliação mínima">
          <option value="">Qualquer avaliação</option>
          <option value="4">4+ estrelas</option>
          <option value="4.5">4,5+ estrelas</option>
        </Select>
        <input name="taxa" defaultValue={sp.taxa ?? ""} inputMode="decimal" placeholder={`Taxa máx. (${settings.currency})`} aria-label="Taxa de entrega máxima" className="h-11 rounded-xl border border-line px-3 text-sm" />
        <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2"><input type="checkbox" name="abertos" value="1" defaultChecked={sp.abertos === "1"} className="h-5 w-5 accent-[var(--brand)]" /> Abertos agora</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="promo" value="1" defaultChecked={sp.promo === "1"} className="h-5 w-5 accent-[var(--brand)]" /> Com promoção</label>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" className="flex-1">Aplicar</Button>
          {hasFilters && <Link href="/restaurantes" className="grid h-11 place-items-center rounded-xl px-3 text-sm font-semibold text-muted hover:bg-ink/5">Limpar</Link>}
        </div>
      </form>

      {products.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold">Pratos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link key={p.id} href={`/restaurante/${p.restaurant.slug}/${p.slug}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted">{p.restaurant.name}</p>
                  <p className="mt-1 text-sm font-semibold">{formatMoney(p.priceCents, settings.currency)}</p>
                </div>
                {p.imageFileId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p.imageFileId)!} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        {list.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={SearchX} title="Nenhum resultado" description="Não encontrámos restaurantes com estes critérios. Experimente outros filtros." />
          ) : (
            <EmptyState icon={Store} title="Ainda não existem restaurantes disponíveis nesta região." description="Estamos a preparar novidades para ti." />
          )
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">{list.length} {list.length === 1 ? "restaurante" : "restaurantes"}</p>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((r) => <RestaurantCard key={r.id} r={r} currency={settings.currency} />)}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
