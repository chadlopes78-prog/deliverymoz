"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, type FormAction } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { Button, SubmitButton } from "@/components/ui/button";

type Opt = { name: string; price: string; isAvailable: boolean };
type Group = { name: string; minSelect: number; maxSelect: number; options: Opt[] };

export type ProductInitial = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string | null;
  paused: boolean;
  isFeatured: boolean;
  availableFrom: string;
  availableUntil: string;
  prepTimeMinutes?: string;
  imageUrl: string | null;
  groups: Group[];
};

function toCents(v: string) {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Editor de produto com variantes (escolha obrigatória) e complementos (opcionais). */
export function ProductEditor({ action, categories, initial, currency, restaurants, restaurantId }: {
  action: FormAction;
  /** Com `restaurants` (Admin), cada categoria indica o seu restaurante e a lista é filtrada pelo restaurante escolhido. */
  categories: { id: string; name: string; restaurantId?: string }[];
  initial?: ProductInitial;
  currency: string;
  restaurants?: { id: string; name: string }[];
  restaurantId?: string;
}) {
  const [rid, setRid] = useState(restaurantId ?? "");
  const visibleCategories = restaurants ? categories.filter((c) => c.restaurantId === rid) : categories;
  const [groups, setGroups] = useState<Group[]>(initial?.groups ?? []);
  const [preview, setPreview] = useState<string | null>(initial?.imageUrl ?? null);

  const update = (gi: number, patch: Partial<Group>) => setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const updateOpt = (gi: number, oi: number, patch: Partial<Opt>) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : g)));

  const serialized = JSON.stringify(
    groups.map((g) => ({
      name: g.name,
      minSelect: Number(g.minSelect) || 0,
      maxSelect: Math.max(1, Number(g.maxSelect) || 1),
      options: g.options.filter((o) => o.name.trim()).map((o) => ({ name: o.name, priceDeltaCents: toCents(o.price || "0"), isAvailable: o.isAvailable })),
    })),
  );

  return (
    <ActionForm action={action} className="space-y-5">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="optionGroups" value={serialized} />
      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 sm:p-5">
        {restaurants && (
          <Field label="Restaurante" htmlFor="restaurantId" className="sm:col-span-2" hint={initial ? "O restaurante de um produto existente não pode ser alterado." : undefined}>
            <Select id="restaurantId" name="restaurantId" value={rid} onChange={(e) => setRid(e.target.value)} required disabled={!!initial}>
              <option value="">Escolha o restaurante</option>
              {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            {initial && <input type="hidden" name="restaurantId" value={rid} />}
          </Field>
        )}
        <Field label="Nome do produto" htmlFor="name" className="sm:col-span-2"><Input id="name" name="name" defaultValue={initial?.name} required minLength={2} maxLength={120} /></Field>
        <Field label="Descrição" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={initial?.description ?? ""} maxLength={1000} /></Field>
        <Field label={`Preço (${currency})`} htmlFor="price"><Input id="price" name="price" inputMode="decimal" defaultValue={initial?.price} required placeholder="0,00" /></Field>
        <Field label="Categoria" htmlFor="categoryId">
          <Select key={rid} id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">Sem categoria</option>
            {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tempo de preparação (minutos)" htmlFor="prepTimeMinutes" hint="Opcional"><Input id="prepTimeMinutes" name="prepTimeMinutes" type="number" min={1} max={240} defaultValue={initial?.prepTimeMinutes} /></Field>
        <div className="hidden sm:block" />
        <Field label="Disponível a partir de" htmlFor="availableFrom" hint="Opcional (ex.: pequeno-almoço)"><Input id="availableFrom" name="availableFrom" type="time" defaultValue={initial?.availableFrom} /></Field>
        <Field label="Disponível até" htmlFor="availableUntil"><Input id="availableUntil" name="availableUntil" type="time" defaultValue={initial?.availableUntil} /></Field>
        <Field label="Fotografia (JPG, PNG ou WebP, até 8 MB)" htmlFor="image" className="sm:col-span-2">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt="" className="h-20 w-20 rounded-xl object-cover" />}
            <Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" className="py-2" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
          </div>
          {initial?.imageUrl && <Checkbox name="removeImage" label="Remover fotografia atual" className="mt-2" />}
        </Field>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Checkbox name="paused" defaultChecked={initial?.paused} label="Pausado (indisponível para encomenda)" />
          <Checkbox name="isFeatured" defaultChecked={initial?.isFeatured} label="Destacar no topo do cardápio" />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Variantes e complementos</h2><p className="text-xs text-muted">Ex.: “Tamanho” (mín. 1, máx. 1) ou “Extras” (mín. 0, máx. 3).</p></div>
          <Button type="button" variant="outline" size="sm" onClick={() => setGroups((g) => [...g, { name: "", minSelect: 0, maxSelect: 1, options: [{ name: "", price: "0", isAvailable: true }] }])}><Plus className="h-4 w-4" /> Adicionar grupo</Button>
        </div>
        {groups.length === 0 && <p className="text-sm text-muted">Sem opções. O produto é vendido tal como está.</p>}
        <div className="space-y-4">
          {groups.map((g, gi) => (
            <fieldset key={gi} className="rounded-xl border border-line p-3">
              <legend className="sr-only">Grupo {gi + 1}</legend>
              <div className="grid gap-2 sm:grid-cols-[1fr_90px_90px_auto]">
                <Input value={g.name} onChange={(e) => update(gi, { name: e.target.value })} placeholder="Nome do grupo (ex.: Tamanho)" aria-label="Nome do grupo" required />
                <Input type="number" min={0} max={20} value={g.minSelect} onChange={(e) => update(gi, { minSelect: Number(e.target.value) })} aria-label="Mínimo" title="Mínimo de escolhas" />
                <Input type="number" min={1} max={20} value={g.maxSelect} onChange={(e) => update(gi, { maxSelect: Number(e.target.value) })} aria-label="Máximo" title="Máximo de escolhas" />
                <Button type="button" variant="ghost" size="icon" onClick={() => setGroups((gs) => gs.filter((_, i) => i !== gi))} aria-label="Remover grupo"><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
              <ul className="mt-3 space-y-2">
                {g.options.map((o, oi) => (
                  <li key={oi} className="grid grid-cols-[1fr_110px_auto] items-center gap-2 sm:grid-cols-[1fr_130px_auto_auto]">
                    <Input value={o.name} onChange={(e) => updateOpt(gi, oi, { name: e.target.value })} placeholder="Opção" aria-label="Nome da opção" />
                    <Input value={o.price} onChange={(e) => updateOpt(gi, oi, { price: e.target.value })} inputMode="decimal" placeholder={`+ ${currency}`} aria-label="Preço adicional" />
                    <label className="hidden items-center gap-1 text-xs sm:flex"><input type="checkbox" checked={o.isAvailable} onChange={(e) => updateOpt(gi, oi, { isAvailable: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" /> Disponível</label>
                    <Button type="button" variant="ghost" size="icon" onClick={() => update(gi, { options: g.options.filter((_, j) => j !== oi) })} aria-label="Remover opção"><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => update(gi, { options: [...g.options, { name: "", price: "0", isAvailable: true }] })}><Plus className="h-4 w-4" /> Opção</Button>
            </fieldset>
          ))}
        </div>
      </section>
      <SubmitButton size="lg" pendingText="A guardar…">{initial ? "Guardar alterações" : "Criar produto"}</SubmitButton>
    </ActionForm>
  );
}
