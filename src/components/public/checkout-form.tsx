"use client";
import { useActionState, useMemo, useState } from "react";
import { LocateFixed, Lock } from "lucide-react";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { formatMoney } from "@/lib/money";
import { placeOrderAction } from "@/app/(public)/actions";
import { cn } from "@/lib/utils";
import type { Geography } from "@/server/location";

type Props = {
  idempotencyKey: string;
  user: { name: string; phone: string | null };
  addresses: { id: string; label: string; street: string; reference: string | null; cityId: string; neighborhoodId: string; neighborhoodName: string; cityName: string }[];
  geography: Geography;
  defaultLocation: { cityId: string | null; neighborhoodId: string | null };
  zones: { neighborhoodId: string; feeCents: number; etaMinutes: number }[];
  methods: { key: string; name: string; instructions: string | null; requiresPhone: boolean }[];
  totals: { subtotalCents: number; discountCents: number; serviceFeeCents: number };
  currency: string;
};

export function CheckoutForm(p: Props) {
  const [state, action] = useActionState(placeOrderAction, null);
  const defaultAddr = p.addresses.find((a) => p.zones.some((z) => z.neighborhoodId === a.neighborhoodId));
  const [addressId, setAddressId] = useState<string>(defaultAddr?.id ?? (p.addresses.length ? p.addresses[0].id : "new"));
  const [cityId, setCityId] = useState(p.defaultLocation.cityId ?? p.geography[0]?.id ?? "");
  const [nbId, setNbId] = useState(p.defaultLocation.cityId === cityId ? (p.defaultLocation.neighborhoodId ?? "") : "");
  const [method, setMethod] = useState(p.methods[0]?.key ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const neighborhoodId = addressId === "new" ? nbId : p.addresses.find((a) => a.id === addressId)?.neighborhoodId ?? "";
  const zone = p.zones.find((z) => z.neighborhoodId === neighborhoodId);
  const total = p.totals.subtotalCents - p.totals.discountCents + p.totals.serviceFeeCents + (zone?.feeCents ?? 0);
  const city = useMemo(() => p.geography.find((c) => c.id === cityId), [p.geography, cityId]);
  const selectedMethod = p.methods.find((m) => m.key === method);

  function locate() {
    if (!("geolocation" in navigator)) return setGeoMsg("O seu navegador não suporta localização.");
    setGeoMsg("A obter localização…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoMsg("Localização partilhada com o pedido.");
      },
      () => setGeoMsg("Não foi possível obter a localização. Pode continuar com o endereço escrito."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="idempotencyKey" value={p.idempotencyKey} />
      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-bold">Endereço de entrega</h2>
          {p.addresses.length > 0 && (
            <div className="mb-4 space-y-2">
              {p.addresses.map((a) => {
                const served = p.zones.some((z) => z.neighborhoodId === a.neighborhoodId);
                return (
                  <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", addressId === a.id ? "border-brand bg-brand/5" : "border-line", !served && "opacity-60")}>
                    <input type="radio" name="addressId" value={a.id} checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 h-5 w-5 accent-[var(--brand)]" />
                    <span className="text-sm">
                      <span className="font-semibold">{a.label}</span> — {a.street}, {a.neighborhoodName}, {a.cityName}
                      {a.reference && <span className="block text-xs text-muted">Ref.: {a.reference}</span>}
                      {!served && <span className="block text-xs font-semibold text-red-600">Este restaurante não entrega neste bairro.</span>}
                    </span>
                  </label>
                );
              })}
              <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold", addressId === "new" ? "border-brand bg-brand/5" : "border-line")}>
                <input type="radio" name="addressId" value="new" checked={addressId === "new"} onChange={() => setAddressId("new")} className="h-5 w-5 accent-[var(--brand)]" /> Usar outro endereço
              </label>
            </div>
          )}
          {addressId === "new" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cidade" htmlFor="cityId">
                <Select id="cityId" name="cityId" value={cityId} onChange={(e) => { setCityId(e.target.value); setNbId(""); }} required>
                  {p.geography.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Bairro" htmlFor="neighborhoodId" error={nbId && !zone ? "Este restaurante não entrega neste bairro." : undefined}>
                <Select id="neighborhoodId" name="neighborhoodId" value={nbId} onChange={(e) => setNbId(e.target.value)} required>
                  <option value="">Escolha o bairro</option>
                  {city?.neighborhoods.map((n) => <option key={n.id} value={n.id}>{n.name}{p.zones.some((z) => z.neighborhoodId === n.id) ? "" : " (sem entrega)"}</option>)}
                </Select>
              </Field>
              <Field label="Rua / avenida e número" htmlFor="street" className="sm:col-span-2">
                <Input id="street" name="street" required minLength={3} maxLength={200} autoComplete="street-address" placeholder="Ex.: Av. Julius Nyerere, 1234" />
              </Field>
              <Field label="Ponto de referência" htmlFor="reference" hint="Ajuda o estafeta a encontrar-te: cor do portão, prédio, loja próxima…" className="sm:col-span-2">
                <Input id="reference" name="reference" maxLength={300} placeholder="Ex.: Portão verde, ao lado da farmácia" />
              </Field>
              <div className="sm:col-span-2">
                <button type="button" onClick={locate} className="inline-flex items-center gap-2 text-sm font-semibold text-brand"><LocateFixed className="h-4 w-4" /> Partilhar a minha localização atual (opcional)</button>
                {geoMsg && <p className="mt-1 text-xs text-muted">{geoMsg}</p>}
                {coords && <><input type="hidden" name="latitude" value={coords.lat} /><input type="hidden" name="longitude" value={coords.lng} /></>}
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Checkbox name="saveAddress" label="Guardar este endereço como" defaultChecked />
                <Input name="addressLabel" defaultValue="Casa" maxLength={40} className="h-9 w-32" aria-label="Nome do endereço" />
              </div>
            </div>
          )}
          <Field label="Observações para a entrega" htmlFor="notesForDelivery" className="mt-4">
            <Input id="notesForDelivery" name="notesForDelivery" maxLength={500} placeholder="Ex.: ligar ao chegar" />
          </Field>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-bold">Contacto</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="customerName"><Input id="customerName" name="customerName" defaultValue={p.user.name} required autoComplete="name" /></Field>
            <Field label="Telefone" htmlFor="customerPhone"><Input id="customerPhone" name="customerPhone" type="tel" inputMode="tel" defaultValue={p.user.phone ? p.user.phone.replace(/^258/, "") : ""} required autoComplete="tel" placeholder="84 123 4567" /></Field>
          </div>
          <Field label="Observações para o restaurante" htmlFor="notesForRestaurant" className="mt-4">
            <Textarea id="notesForRestaurant" name="notesForRestaurant" maxLength={500} className="min-h-16" />
          </Field>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-4 text-lg font-bold">Pagamento</h2>
          {p.methods.length === 0 ? (
            <p className="text-sm text-red-600">Não existem métodos de pagamento disponíveis de momento. Contacte o suporte.</p>
          ) : (
            <div className="space-y-2">
              {p.methods.map((m) => (
                <label key={m.key} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", method === m.key ? "border-brand bg-brand/5" : "border-line")}>
                  <input type="radio" name="paymentMethod" value={m.key} checked={method === m.key} onChange={() => setMethod(m.key)} className="mt-0.5 h-5 w-5 accent-[var(--brand)]" />
                  <span className="text-sm"><span className="font-semibold">{m.name}</span>{m.instructions && <span className="block text-xs text-muted">{m.instructions}</span>}</span>
                </label>
              ))}
            </div>
          )}
          {selectedMethod?.requiresPhone && (
            <Field label="Número para pagamento" htmlFor="payerPhone" hint="Vai receber um pedido de confirmação no telemóvel." className="mt-4">
              <Input id="payerPhone" name="payerPhone" type="tel" inputMode="tel" defaultValue={p.user.phone ? p.user.phone.replace(/^258/, "") : ""} placeholder="84 123 4567" />
            </Field>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <h2 className="mb-3 text-base font-bold">Resumo</h2>
          <dl className="space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(p.totals.subtotalCents, p.currency)}</dd></div>
            {p.totals.discountCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Desconto</dt><dd>−{formatMoney(p.totals.discountCents, p.currency)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Entrega</dt><dd>{zone ? (zone.feeCents ? formatMoney(zone.feeCents, p.currency) : "Grátis") : "—"}</dd></div>
            {p.totals.serviceFeeCents > 0 && <div className="flex justify-between"><dt className="text-muted">Taxa de serviço</dt><dd>{formatMoney(p.totals.serviceFeeCents, p.currency)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd>{formatMoney(total, p.currency)}</dd></div>
          </dl>
          {zone && <p className="mt-2 text-xs text-muted">Entrega estimada: {zone.etaMinutes} min após preparação.</p>}
          <p className="mt-2 text-xs text-muted">O total final é confirmado pelo servidor ao submeter.</p>
          <div className="mt-4"><FormMessage state={state} /></div>
          <SubmitButton size="lg" className="mt-3 w-full" disabled={!zone || !p.methods.length} pendingText="A enviar pedido…">
            <Lock className="h-4 w-4" /> Fazer pedido
          </SubmitButton>
        </div>
      </aside>
    </form>
  );
}
