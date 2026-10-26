import { Tag } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { CouponForm } from "@/components/admin/coupon-form";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/components/status";
import { partnerCouponAction, partnerCouponToggleAction } from "../../actions";

export const metadata = { title: "Promoções" };

export default async function PartnerPromotions() {
  const ctx = await requirePartner("promotions.manage");
  const settings = await getSettings();
  const coupons = await db.coupon.findMany({
    where: { fundedBy: "RESTAURANT", restaurants: { some: { id: ctx.restaurantId } } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: { where: { voided: false } } } }, restaurants: { select: { id: true } } },
  });
  const own = coupons.filter((c) => c.restaurants.length === 1);
  return (
    <>
      <PageHeader title="Promoções" description="Cupões da sua loja. O desconto é suportado pelo restaurante e reduz a base de cálculo da comissão." />
      <Card className="mb-5"><CardHeader title="Novo cupão" /><CardBody><CouponForm action={partnerCouponAction} currency={settings.currency} timezone={settings.timezone} scope="restaurant" /></CardBody></Card>
      {own.length === 0 ? <EmptyState icon={Tag} title="Ainda não criou promoções" /> : (
        <ul className="space-y-3">
          {own.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-ink/5 px-2 py-1 font-mono text-sm font-bold">{c.code}</span><span className="text-sm">{c.type === "PERCENT" ? `${c.value / 100}%` : formatMoney(c.value, settings.currency)}</span><Badge tone={c.isActive ? "green" : "neutral"}>{c.isActive ? "Ativo" : "Inativo"}</Badge></div>
                <QuickAction action={partnerCouponToggleAction} hidden={{ id: c.id, isActive: c.isActive ? "false" : "true" }} label={c.isActive ? "Desativar" : "Ativar"} />
              </div>
              <p className="mt-1 text-xs text-muted">Utilizações: {c._count.redemptions}{c.usageLimitTotal ? ` / ${c.usageLimitTotal}` : ""}{c.endsAt ? ` · até ${formatDate(c.endsAt, undefined, settings.timezone)}` : ""}</p>
              <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary><div className="mt-3"><CouponForm action={partnerCouponAction} coupon={c} currency={settings.currency} timezone={settings.timezone} scope="restaurant" /></div></details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
