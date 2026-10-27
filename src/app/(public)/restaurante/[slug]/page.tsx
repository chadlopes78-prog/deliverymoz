import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Star, Clock, MapPin, Heart, Bike, Info } from "lucide-react";
import { getPublicRestaurant } from "@/server/services/restaurant-page";
import { getSessionUser } from "@/server/auth/session";
import { getCustomerLocation } from "@/server/location";
import { db } from "@/server/db";
import { MenuView } from "@/components/public/menu-view";
import { Thumb } from "@/components/public/restaurant-card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { DAY_NAMES, minutesToTime } from "@/lib/utils";
import { fileUrl } from "@/server/storage/files";
import { toggleFavoriteAction } from "../../actions";
import { formatDate } from "@/components/status";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getPublicRestaurant((await params).slug);
  if (!data) return { title: "Restaurante não encontrado", robots: { index: false } };
  const r = data.restaurant;
  const description = r.description?.slice(0, 160) || `Peça online em ${r.name}, ${r.city.name}.`;
  return {
    title: r.name,
    description,
    alternates: { canonical: `/restaurante/${r.slug}` },
    openGraph: { title: r.name, description, images: r.coverFileId ? [fileUrl(r.coverFileId)!] : undefined },
  };
}

export default async function RestaurantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ produto?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getPublicRestaurant(slug);
  if (!data) notFound();
  const { restaurant: r, categories, availability, settings } = data;
  const [user, location] = await Promise.all([getSessionUser(), getCustomerLocation()]);
  const isFav = user ? !!(await db.favorite.findUnique({ where: { userId_restaurantId: { userId: user.id, restaurantId: r.id } } })) : false;
  const reviews = await db.review.findMany({ where: { restaurantId: r.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 6, include: { customer: { select: { name: true } } } });
  const myZone = location?.neighborhoodId ? r.zones.find((z) => z.neighborhoodId === location.neighborhoodId) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.name,
    description: r.description ?? undefined,
    address: { "@type": "PostalAddress", streetAddress: r.addressLine, addressLocality: r.city.name, addressCountry: r.city.countryCode },
    servesCuisine: r.cuisines.map((c) => c.name),
    ...(r.ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: r.ratingAvg.toFixed(1), reviewCount: r.ratingCount } } : {}),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="-mx-4 h-36 overflow-hidden bg-gradient-to-br from-brand/25 to-accent/25 sm:mx-0 sm:mt-5 sm:h-56 sm:rounded-3xl">
        {r.coverFileId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(r.coverFileId)!} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="relative -mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-3">
          <div className="rounded-2xl bg-surface p-1 shadow-md"><Thumb id={r.logoFileId} name={r.name} size="lg" /></div>
          <div className="min-w-0 pb-1">
            <h1 className="text-xl font-extrabold sm:text-2xl">{r.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {r.ratingCount > 0 ? <span className="flex items-center gap-1 font-semibold text-amber-600"><Star className="h-4 w-4 fill-current" />{r.ratingAvg.toFixed(1)} <span className="font-normal text-muted">({r.ratingCount} avaliações)</span></span> : <span>Sem avaliações</span>}
              {r.cuisines.length > 0 && <span>{r.cuisines.map((c) => c.name).join(" · ")}</span>}
            </div>
          </div>
        </div>
        <ActionForm action={toggleFavoriteAction} hideMessage>
          <input type="hidden" name="restaurantId" value={r.id} />
          <input type="hidden" name="back" value={`/restaurante/${r.slug}`} />
          <SubmitButton variant="outline" size="sm" aria-pressed={isFav}>
            <Heart className={isFav ? "h-4 w-4 fill-brand text-brand" : "h-4 w-4"} /> {isFav ? "Favorito" : "Favoritar"}
          </SubmitButton>
        </ActionForm>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <Badge tone={availability.orderable ? "green" : "neutral"}>{availability.label}</Badge>
          <span className="flex items-center gap-1 text-muted"><Clock className="h-4 w-4" /> {r.prepTimeMinutes + (myZone?.etaMinutes ?? r.zones[0]?.etaMinutes ?? 0)} min</span>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <Bike className="h-4 w-4 text-muted" />
          {myZone ? <span>Entrega em {location!.neighborhoodName}: <strong>{myZone.feeCents ? formatMoney(myZone.feeCents, settings.currency) : "grátis"}</strong></span>
            : location?.neighborhoodId ? <span className="text-red-600">Não entrega em {location.neighborhoodName}</span>
            : <span>{r.zones.length ? `Entrega desde ${formatMoney(r.zones[0].feeCents, settings.currency)}` : "Sem zonas de entrega"}</span>}
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <Info className="h-4 w-4 text-muted" /> Pedido mínimo: <strong>{r.minOrderCents ? formatMoney(r.minOrderCents, settings.currency) : "sem mínimo"}</strong>
        </div>
      </div>
      {r.description && <p className="mt-4 max-w-3xl text-sm text-muted">{r.description}</p>}

      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_300px] [&>*]:min-w-0">
        <div className="min-w-0">
          <MenuView categories={categories} currency={settings.currency} orderable={availability.orderable} closedLabel={availability.orderable ? "" : `Restaurante ${availability.label.toLowerCase()}`} initialProductId={sp.produto} />
        </div>
        <aside className="space-y-4 lg:pt-5">
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-2 font-semibold">Horário</h2>
            {r.hours.length === 0 ? <p className="text-sm text-muted">Horário não definido.</p> : (
              <ul className="space-y-1 text-sm">
                {DAY_NAMES.map((d, i) => {
                  const hs = r.hours.filter((h) => h.dayOfWeek === i);
                  return <li key={d} className="flex justify-between gap-2"><span className="text-muted">{d}</span><span>{hs.length ? hs.map((h) => `${minutesToTime(h.opensAt)}–${minutesToTime(h.closesAt)}`).join(", ") : "Fechado"}</span></li>;
                })}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <h2 className="mb-2 font-semibold">Localização</h2>
            <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{r.addressLine}{r.neighborhood ? `, ${r.neighborhood.name}` : ""}, {r.city.name}</p>
            {r.zones.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold">Bairros atendidos ({r.zones.length})</summary>
                <ul className="mt-2 space-y-1">
                  {r.zones.map((z) => <li key={z.id} className="flex justify-between"><span>{z.neighborhood.name}</span><span className="text-muted">{z.feeCents ? formatMoney(z.feeCents, settings.currency) : "grátis"}</span></li>)}
                </ul>
              </details>
            )}
          </section>
          {reviews.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <h2 className="mb-2 font-semibold">Avaliações recentes</h2>
              <ul className="space-y-3">
                {reviews.map((rv) => (
                  <li key={rv.id}>
                    <div className="flex items-center justify-between"><span className="font-medium">{rv.customer.name.split(" ")[0]}</span><span className="flex items-center gap-0.5 text-amber-600">{Array.from({ length: rv.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}</span></div>
                    {rv.comment && <p className="mt-1 text-muted">{rv.comment}</p>}
                    {rv.reply && <p className="mt-1 rounded-lg bg-ink/5 p-2 text-xs"><strong>Resposta:</strong> {rv.reply}</p>}
                    <p className="mt-1 text-xs text-muted">{formatDate(rv.createdAt, { dateStyle: "medium" })}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
