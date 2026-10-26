import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getCartView } from "@/server/services/cart";
import { availablePaymentMethods } from "@/server/services/orders";
import { getCustomerLocation, getGeography } from "@/server/location";
import { db } from "@/server/db";
import { randomToken } from "@/server/auth/tokens";
import { CheckoutForm } from "@/components/public/checkout-form";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button-class";

// As ações desta página podem aguardar a confirmação M-Pesa no telemóvel (pedido síncrono).
export const maxDuration = 120;

export const metadata: Metadata = { title: "Finalizar pedido", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const [cart, location, geography, methods, addresses] = await Promise.all([
    getCartView({ userId: user.id }),
    getCustomerLocation(),
    getGeography(),
    availablePaymentMethods(),
    db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }], include: { neighborhood: true, city: true } }),
  ]);
  if (!cart) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState icon={ShoppingBag} title="A sua sacola está vazia" action={<Link href="/restaurantes" className={buttonClass()}>Ver restaurantes</Link>} />
      </div>
    );
  }
  if (cart.hasProblems || !cart.restaurant.availability.orderable) redirect("/sacola");
  const restaurantCityGeo = geography.filter((g) => g.id === cart.restaurant.cityId);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-bold sm:text-2xl">Finalizar pedido</h1>
      <p className="mb-5 text-sm text-muted">{cart.restaurant.name} · {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"}</p>
      <CheckoutForm
        idempotencyKey={randomToken(18)}
        user={{ name: user.name, phone: user.phone }}
        addresses={addresses.filter((a) => a.cityId === cart.restaurant.cityId).map((a) => ({ id: a.id, label: a.label, street: a.street, reference: a.reference, cityId: a.cityId, neighborhoodId: a.neighborhoodId, neighborhoodName: a.neighborhood.name, cityName: a.city.name }))}
        geography={restaurantCityGeo}
        defaultLocation={{ cityId: cart.restaurant.cityId, neighborhoodId: location?.cityId === cart.restaurant.cityId ? location.neighborhoodId : null }}
        zones={cart.restaurant.zones}
        methods={methods.filter((m) => m.key !== "CASH_ON_DELIVERY" || cart.restaurant.acceptsCashOnDelivery)}
        totals={{ subtotalCents: cart.subtotalCents, discountCents: cart.discountCents, serviceFeeCents: cart.serviceFeeCents }}
        currency={cart.currency}
      />
      <div className="h-16 lg:hidden" aria-hidden />
    </div>
  );
}
