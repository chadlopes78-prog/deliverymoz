import Link from "next/link";
import type { Metadata } from "next";
import { ShoppingBag, AlertTriangle } from "lucide-react";
import { getCartRef } from "@/server/cart-ref";
import { getCartView } from "@/server/services/cart";
import { getCustomerLocation } from "@/server/location";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { QuantityStepper } from "@/components/public/cart-line";
import { formatMoney } from "@/lib/money";
import { clearCartAction, couponAction } from "../actions";
import { fileUrl } from "@/server/storage/files";

export const metadata: Metadata = { title: "Sacola", robots: { index: false } };

export default async function CartPage() {
  const location = await getCustomerLocation();
  const cart = await getCartView(await getCartRef(), { neighborhoodId: location?.neighborhoodId });
  if (!cart) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState icon={ShoppingBag} title="A sua sacola está vazia" description="Explore os restaurantes e adicione os seus pratos preferidos." action={<Link href="/restaurantes" className={buttonClass()}>Ver restaurantes</Link>} />
      </div>
    );
  }
  const c = cart.currency;
  const belowMin = cart.subtotalCents < cart.restaurant.minOrderCents;
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
      <section>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">O seu pedido em</p>
            <Link href={`/restaurante/${cart.restaurant.slug}`} className="text-xl font-bold hover:text-brand">{cart.restaurant.name}</Link>
          </div>
          <ActionForm action={clearCartAction} confirmMessage="Esvaziar a sacola?" hideMessage>
            <button className="text-sm font-semibold text-red-600">Esvaziar</button>
          </ActionForm>
        </div>
        {!cart.restaurant.availability.orderable && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /> O restaurante está {cart.restaurant.availability.label.toLowerCase()}. Não é possível finalizar agora.</p>
        )}
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {cart.lines.map((l) => (
            <li key={l.itemId} className="flex gap-3 p-4">
              {l.imageFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(l.imageFileId)!} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{l.name}</p>
                {l.priced?.options.length ? <p className="text-xs text-muted">{l.priced.options.map((o) => o.name).join(", ")}</p> : null}
                {l.priced?.notes && <p className="text-xs italic text-muted">“{l.priced.notes}”</p>}
                {l.problem && <p className="mt-1 text-xs font-semibold text-red-600">{l.problem}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <QuantityStepper itemId={l.itemId} quantity={l.quantity} />
                  <span className="font-semibold tabular-nums">{l.priced ? formatMoney(l.priced.totalCents, c) : "—"}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Link href={`/restaurante/${cart.restaurant.slug}`} className="mt-3 inline-block text-sm font-semibold text-brand">+ Adicionar mais itens</Link>
      </section>

      <aside className="space-y-4">
        <ActionForm action={couponAction} className="rounded-2xl border border-line bg-surface p-4">
          <label htmlFor="coupon" className="text-sm font-semibold">Cupão de desconto</label>
          <div className="mt-2 flex gap-2">
            <Input id="coupon" name="code" defaultValue={cart.coupon?.code ?? ""} placeholder="CÓDIGO" className="uppercase" autoComplete="off" />
            <SubmitButton variant="outline">Aplicar</SubmitButton>
          </div>
          {cart.coupon?.message && <p className="mt-2 text-xs text-red-600">{cart.coupon.message}</p>}
          {cart.coupon && !cart.coupon.message && <p className="mt-2 text-xs text-emerald-700">Cupão {cart.coupon.code} aplicado.</p>}
        </ActionForm>
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <dl className="space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(cart.subtotalCents, c)}</dd></div>
            {cart.discountCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Desconto</dt><dd className="tabular-nums">−{formatMoney(cart.discountCents, c)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Taxa de entrega</dt><dd className="tabular-nums">{cart.deliveryFeeCents == null ? (cart.deliveryAvailable === false ? <span className="text-red-600">Não entrega no seu bairro</span> : "Calculada no checkout") : cart.deliveryFeeCents === 0 ? "Grátis" : formatMoney(cart.deliveryFeeCents, c)}</dd></div>
            {cart.serviceFeeCents > 0 && <div className="flex justify-between"><dt className="text-muted">Taxa de serviço</dt><dd className="tabular-nums">{formatMoney(cart.serviceFeeCents, c)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(cart.totalCents, c)}</dd></div>
          </dl>
          {belowMin && <p className="mt-3 text-xs text-amber-700">Pedido mínimo: {formatMoney(cart.restaurant.minOrderCents, c)}.</p>}
          {cart.hasProblems || belowMin || !cart.restaurant.availability.orderable ? (
            <span className={buttonClass("primary", "lg", "mt-4 w-full opacity-50 pointer-events-none")} aria-disabled>Continuar</span>
          ) : (
            <Link href="/checkout" className={buttonClass("primary", "lg", "mt-4 w-full")}>Continuar</Link>
          )}
        </div>
      </aside>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}
