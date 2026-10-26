"use client";
import { useMemo, useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Minus, Plus, UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/money";
import { addToCartAction } from "@/app/(public)/actions";
import { cn } from "@/lib/utils";

export type MenuProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  available: boolean;
  featured: boolean;
  groups: { id: string; name: string; min: number; max: number; options: { id: string; name: string; deltaCents: number; available: boolean }[] }[];
};
export type MenuCategoryView = { id: string; name: string; description: string | null; products: MenuProduct[] };

export function MenuView({ categories, currency, orderable, closedLabel, initialProductId }: { categories: MenuCategoryView[]; currency: string; orderable: boolean; closedLabel: string; initialProductId?: string | null }) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => categories.flatMap((c) => c.products), [categories]);
  const [selected, setSelected] = useState<MenuProduct | null>(() => all.find((p) => p.id === initialProductId) ?? null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((c) => ({ ...c, products: c.products.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)) }))
      .filter((c) => c.products.length);
  }, [categories, query]);

  if (!all.length) {
    return <EmptyState icon={UtensilsCrossed} title="Este restaurante ainda não adicionou produtos ao seu cardápio." />;
  }
  const featured = all.filter((p) => p.featured && p.available);
  return (
    <div>
      <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Procurar no cardápio" aria-label="Procurar no cardápio" className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm focus:border-brand focus:outline-none" />
        </div>
        {!query && categories.length > 1 && (
          <nav className="scrollbar-none mt-3 flex gap-2 overflow-x-auto" aria-label="Categorias do cardápio">
            {categories.map((c) => (
              <a key={c.id} href={`#cat-${c.id}`} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm font-medium ring-1 ring-line hover:text-brand">{c.name}</a>
            ))}
          </nav>
        )}
      </div>

      {!query && featured.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-3 text-lg font-bold">Destaques</h2>
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {featured.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)} className="w-40 shrink-0 text-left">
                <div className="aspect-square overflow-hidden rounded-2xl bg-ink/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl && <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold">{p.name}</p>
                <p className="text-sm">{formatMoney(p.priceCents, currency)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhum produto encontrado.</p>}
      {filtered.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="mt-6 scroll-mt-40">
          <h2 className="text-lg font-bold">{c.name}</h2>
          {c.description && <p className="text-sm text-muted">{c.description}</p>}
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {c.products.map((p) => (
              <li key={p.id}>
                <button onClick={() => setSelected(p)} className={cn("flex w-full gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-brand/40 hover:shadow-sm", !p.available && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{p.description}</p>}
                    <p className="mt-2 text-sm font-semibold">{p.groups.some((g) => g.options.some((o) => o.deltaCents > 0)) && <span className="font-normal text-muted">desde </span>}{formatMoney(p.priceCents, currency)}</p>
                    {!p.available && <p className="mt-1 text-xs font-semibold text-red-600">Indisponível</p>}
                  </div>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} loading="lazy" decoding="async" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {selected && <ProductModal product={selected} currency={currency} orderable={orderable} closedLabel={closedLabel} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ProductModal({ product, currency, orderable, closedLabel, onClose }: { product: MenuProduct; currency: string; orderable: boolean; closedLabel: string; onClose: () => void }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(product.groups.map((g) => [g.id, g.min === 1 && g.max === 1 ? [g.options.find((o) => o.available)?.id].filter(Boolean) as string[] : []])),
  );
  const [state, action, pending] = useActionState(addToCartAction, null);
  const [replace, setReplace] = useState(false);
  const conflict = state && !state.ok && state.error === "CONFLICT" ? (state.data?.conflict as string) : null;

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  const unit = product.priceCents + product.groups.flatMap((g) => g.options.filter((o) => picked[g.id]?.includes(o.id))).reduce((s, o) => s + o.deltaCents, 0);
  const missing = product.groups.find((g) => (picked[g.id]?.length ?? 0) < g.min);

  function toggle(gid: string, oid: string, max: number) {
    setPicked((prev) => {
      const cur = prev[gid] ?? [];
      if (cur.includes(oid)) return { ...prev, [gid]: cur.filter((x) => x !== oid) };
      if (max === 1) return { ...prev, [gid]: [oid] };
      if (cur.length >= max) return prev;
      return { ...prev, [gid]: [...cur, oid] };
    });
  }

  const canAdd = orderable && product.available && !missing;
  return (
    <Modal
      open
      onClose={onClose}
      title={product.name}
      footer={
        <form action={action} className="flex items-center gap-3">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="quantity" value={qty} />
          {replace && <input type="hidden" name="replace" value="1" />}
          {Object.values(picked).flat().map((id) => <input key={id} type="hidden" name="optionId" value={id} />)}
          <input type="hidden" name="notes" value={notes} />
          <div className="flex items-center rounded-xl border border-line">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center" aria-label="Diminuir quantidade"><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} className="grid h-11 w-11 place-items-center" aria-label="Aumentar quantidade"><Plus className="h-4 w-4" /></button>
          </div>
          <Button type="submit" className="flex-1" size="lg" disabled={!canAdd} loading={pending}>
            {!orderable ? closedLabel : !product.available ? "Indisponível" : missing ? `Escolha: ${missing.name}` : `Adicionar · ${formatMoney(unit * qty, currency)}`}
          </Button>
        </form>
      }
    >
      {product.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.imageUrl} alt={product.name} className="mb-4 aspect-[4/3] w-full rounded-2xl object-cover" />
      )}
      {product.description && <p className="text-sm text-muted">{product.description}</p>}
      <p className="mt-2 text-lg font-bold">{formatMoney(product.priceCents, currency)}</p>
      {product.groups.map((g) => (
        <fieldset key={g.id} className="mt-5">
          <legend className="flex w-full items-center justify-between rounded-xl bg-ink/5 px-3 py-2">
            <span className="font-semibold">{g.name}</span>
            <span className="text-xs text-muted">{g.min > 0 ? `Obrigatório · ` : "Opcional · "}{g.max === 1 ? "escolha 1" : `até ${g.max}`}</span>
          </legend>
          <ul className="divide-y divide-line">
            {g.options.map((o) => {
              const checked = picked[g.id]?.includes(o.id) ?? false;
              return (
                <li key={o.id}>
                  <label className={cn("flex cursor-pointer items-center justify-between gap-3 py-3", !o.available && "cursor-not-allowed opacity-50")}>
                    <span className="text-sm">{o.name}{!o.available && " (indisponível)"}</span>
                    <span className="flex items-center gap-3">
                      {o.deltaCents > 0 && <span className="text-sm text-muted">+ {formatMoney(o.deltaCents, currency)}</span>}
                      <input type={g.max === 1 ? "radio" : "checkbox"} name={`g-${g.id}`} checked={checked} disabled={!o.available} onChange={() => toggle(g.id, o.id, g.max)} className="h-5 w-5 accent-[var(--brand)]" />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <label htmlFor="product-notes" className="mt-5 block text-sm font-semibold">Alguma observação?</label>
      <Textarea id="product-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Ex.: sem cebola, molho à parte…" className="mt-1.5" />
      {conflict && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          A sua sacola tem produtos de <strong>{conflict}</strong>. Só pode encomendar de um restaurante de cada vez.
          <div className="mt-2">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" /> Esvaziar a sacola e adicionar este produto</label>
          </div>
        </div>
      )}
      {state && !state.ok && state.error !== "CONFLICT" && <div className="mt-4"><FormMessage state={state} /></div>}
    </Modal>
  );
}
