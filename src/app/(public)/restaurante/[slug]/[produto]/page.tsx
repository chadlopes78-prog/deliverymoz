import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getPublicRestaurant } from "@/server/services/restaurant-page";
import { formatMoney } from "@/lib/money";
import { buttonClass } from "@/components/ui/button-class";

async function load(slug: string, produto: string) {
  const data = await getPublicRestaurant(slug);
  if (!data) return null;
  const product = data.categories.flatMap((c) => c.products).find((p) => p.slug === produto);
  return product ? { ...data, product } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; produto: string }> }): Promise<Metadata> {
  const { slug, produto } = await params;
  const d = await load(slug, produto);
  if (!d) return { title: "Produto não encontrado", robots: { index: false } };
  return {
    title: `${d.product.name} · ${d.restaurant.name}`,
    description: d.product.description?.slice(0, 160) ?? `${d.product.name} em ${d.restaurant.name}`,
    alternates: { canonical: `/restaurante/${slug}/${produto}` },
    openGraph: { images: d.product.imageUrl ? [d.product.imageUrl] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string; produto: string }> }) {
  const { slug, produto } = await params;
  const d = await load(slug, produto);
  if (!d) notFound();
  const { product: p, restaurant: r, settings } = d;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: p.name,
    description: p.description ?? undefined,
    offers: { "@type": "Offer", price: (p.priceCents / 100).toFixed(2), priceCurrency: settings.currency, availability: p.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href={`/restaurante/${r.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> {r.name}</Link>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-3xl bg-ink/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />}
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">{p.name}</h1>
          {p.description && <p className="mt-2 text-muted">{p.description}</p>}
          <p className="mt-4 text-xl font-bold">{formatMoney(p.priceCents, settings.currency)}</p>
          {!p.available && <p className="mt-2 text-sm font-semibold text-red-600">Indisponível neste momento</p>}
          <Link href={`/restaurante/${r.slug}?produto=${p.id}`} className={buttonClass("primary", "lg", "mt-6 w-full")}>Escolher e adicionar à sacola</Link>
        </div>
      </div>
    </div>
  );
}
