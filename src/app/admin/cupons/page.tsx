import { Ticket } from "lucide-react";
import { requireAdmin } from "@/server/guards";
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
import { couponAction, couponToggleAction } from "../actions";

export const metadata = { title: "Cupões" };

export default async function Coupons() {
  await requireAdmin("marketing.manage");
  const [settings, coupons, cities, restaurants, campaigns] = await Promise.all([
    getSettings(),
    db.coupon.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { restaurants: { select: { id: true, name: true } }, city: true, _count: { select: { redemptions: { where: { voided: false } } } } } }),
    db.city.findMany({ orderBy: { name: "asc" } }),
    db.restaurant.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.campaign.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);
  const options = { cities, restaurants, campaigns };
  const now = new Date();
  return (
    <>
      <PageHeader title="Cupões" description="Todas as condições são validadas no servidor no momento da encomenda." />
      <Card className="mb-5">
        <CardHeader title="Novo cupão" />
        <CardBody><CouponForm action={couponAction} options={options} currency={settings.currency} timezone={settings.timezone} scope="admin" /></CardBody>
      </Card>
      {coupons.length === 0 ? <EmptyState icon={Ticket} title="Ainda não existem cupões" /> : (
        <ul className="space-y-3">
          {coupons.map((c) => {
            const expired = c.endsAt && c.endsAt < now;
            return (
              <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-ink/5 px-2 py-1 font-mono text-sm font-bold">{c.code}</span>
                    <span className="text-sm">{c.type === "PERCENT" ? `${c.value / 100}%` : formatMoney(c.value, settings.currency)}{c.maxDiscountCents ? ` (máx. ${formatMoney(c.maxDiscountCents, settings.currency)})` : ""}</span>
                    <Badge tone={!c.isActive ? "neutral" : expired ? "red" : "green"}>{!c.isActive ? "Inativo" : expired ? "Expirado" : "Ativo"}</Badge>
                    {c.fundedBy === "RESTAURANT" && <Badge tone="purple">Restaurante</Badge>}
                  </div>
                  <QuickAction action={couponToggleAction} hidden={{ id: c.id, isActive: c.isActive ? "false" : "true" }} label={c.isActive ? "Desativar" : "Ativar"} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Utilizações: {c._count.redemptions}{c.usageLimitTotal ? ` / ${c.usageLimitTotal}` : ""} · {c.restaurants.length ? c.restaurants.map((r) => r.name).join(", ") : "Todos os restaurantes"}{c.city ? ` · ${c.city.name}` : ""}{c.endsAt ? ` · até ${formatDate(c.endsAt, undefined, settings.timezone)}` : ""}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary>
                  <div className="mt-3"><CouponForm action={couponAction} coupon={c} restaurantIds={c.restaurants.map((r) => r.id)} options={options} currency={settings.currency} timezone={settings.timezone} scope="admin" /></div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
