import type { Coupon } from "@prisma/client";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { centsToInput } from "@/lib/money";
import { utcToLocalInput } from "@/lib/hours";
import type { FormAction } from "@/components/ui/action-form";

/** Formulário de cupão partilhado entre a administração e o painel do restaurante. */
export function CouponForm({ action, coupon, restaurantIds = [], options, currency, timezone, scope }: {
  action: FormAction;
  coupon?: Coupon | null;
  restaurantIds?: string[];
  options?: { cities: { id: string; name: string }[]; restaurants: { id: string; name: string }[]; campaigns: { id: string; name: string }[] };
  currency: string;
  timezone: string;
  scope: "admin" | "restaurant";
}) {
  const c = coupon;
  return (
    <ActionForm action={action} resetOnSuccess={!c} className="grid gap-3 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Código" htmlFor={`code-${c?.id ?? "n"}`}><Input id={`code-${c?.id ?? "n"}`} name="code" defaultValue={c?.code} required className="uppercase" maxLength={30} /></Field>
      <Field label="Tipo" htmlFor={`type-${c?.id ?? "n"}`}>
        <Select id={`type-${c?.id ?? "n"}`} name="type" defaultValue={c?.type ?? "PERCENT"}><option value="PERCENT">Percentagem (%)</option><option value="FIXED">Valor fixo ({currency})</option></Select>
      </Field>
      <Field label="Valor" htmlFor={`value-${c?.id ?? "n"}`} hint="% ou valor, conforme o tipo"><Input id={`value-${c?.id ?? "n"}`} name="value" inputMode="decimal" required defaultValue={c ? (c.type === "PERCENT" ? String(c.value / 100) : centsToInput(c.value)) : ""} /></Field>
      <Field label={`Desconto máximo (${currency})`} htmlFor={`max-${c?.id ?? "n"}`}><Input id={`max-${c?.id ?? "n"}`} name="maxDiscount" inputMode="decimal" defaultValue={centsToInput(c?.maxDiscountCents)} /></Field>
      <Field label={`Valor mínimo do pedido (${currency})`} htmlFor={`min-${c?.id ?? "n"}`}><Input id={`min-${c?.id ?? "n"}`} name="minSubtotal" inputMode="decimal" defaultValue={c ? centsToInput(c.minSubtotalCents) : ""} /></Field>
      <Field label="Limite total de utilizações" htmlFor={`lt-${c?.id ?? "n"}`}><Input id={`lt-${c?.id ?? "n"}`} name="usageLimitTotal" type="number" min={1} defaultValue={c?.usageLimitTotal ?? ""} /></Field>
      <Field label="Limite por cliente" htmlFor={`lu-${c?.id ?? "n"}`}><Input id={`lu-${c?.id ?? "n"}`} name="usageLimitPerUser" type="number" min={1} defaultValue={c ? (c.usageLimitPerUser ?? "") : 1} /></Field>
      <Field label="Início" htmlFor={`s-${c?.id ?? "n"}`}><Input id={`s-${c?.id ?? "n"}`} name="startsAt" type="datetime-local" defaultValue={utcToLocalInput(c?.startsAt, timezone)} /></Field>
      <Field label="Fim" htmlFor={`e-${c?.id ?? "n"}`}><Input id={`e-${c?.id ?? "n"}`} name="endsAt" type="datetime-local" defaultValue={utcToLocalInput(c?.endsAt, timezone)} /></Field>
      {scope === "admin" && options && (
        <>
          <Field label="Cidade" htmlFor={`city-${c?.id ?? "n"}`}><Select id={`city-${c?.id ?? "n"}`} name="cityId" defaultValue={c?.cityId ?? ""}><option value="">Todas</option>{options.cities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Campanha" htmlFor={`camp-${c?.id ?? "n"}`}><Select id={`camp-${c?.id ?? "n"}`} name="campaignId" defaultValue={c?.campaignId ?? ""}><option value="">Nenhuma</option>{options.campaigns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
          <Field label="Financiado por" htmlFor={`f-${c?.id ?? "n"}`}><Select id={`f-${c?.id ?? "n"}`} name="fundedBy" defaultValue={c?.fundedBy ?? "PLATFORM"}><option value="PLATFORM">Plataforma</option><option value="RESTAURANT">Restaurante (reduz a base da comissão)</option></Select></Field>
          <Field label="Restaurantes (vazio = todos)" htmlFor={`r-${c?.id ?? "n"}`} hint="Ctrl/Cmd para selecionar vários">
            <select id={`r-${c?.id ?? "n"}`} name="restaurantIds" multiple defaultValue={restaurantIds} className="h-28 w-full rounded-xl border border-line bg-surface p-2 text-sm">
              {options.restaurants.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        </>
      )}
      <Field label="Descrição" htmlFor={`d-${c?.id ?? "n"}`} className="sm:col-span-2"><Textarea id={`d-${c?.id ?? "n"}`} name="description" defaultValue={c?.description ?? ""} className="min-h-14" maxLength={300} /></Field>
      <div className="flex flex-wrap gap-4 sm:col-span-2">
        <Checkbox name="isActive" defaultChecked={c ? c.isActive : true} label="Ativo" />
        <Checkbox name="firstOrderOnly" defaultChecked={c?.firstOrderOnly} label="Apenas primeira encomenda" />
      </div>
      <div className="sm:col-span-2"><SubmitButton>{c ? "Guardar alterações" : "Criar cupão"}</SubmitButton></div>
    </ActionForm>
  );
}
