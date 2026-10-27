import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReasonForm, QuickAction } from "@/components/reason-form";
import { RefreshButton } from "@/components/refresh-button";
import { Thumb } from "@/components/public/restaurant-card";
import { formatDate } from "@/components/status";
import { formatPhone } from "@/lib/utils";
import { restaurantStatusAction } from "@/app/admin/actions";

export const metadata = { title: "Aprovações" };

/** Candidaturas pendentes de restaurantes (registo de parceiros) e de entregadores. */
export default async function Approvals() {
  const user = await requireAdmin("restaurants.view");
  const canRestaurants = hasAdminPermission(user, "restaurants.manage");
  const canCouriersView = hasAdminPermission(user, "couriers.view");
  const canCouriers = hasAdminPermission(user, "couriers.manage");
  const [restaurants, couriers] = await Promise.all([
    db.restaurant.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { city: true, neighborhood: true, members: { where: { role: "OWNER" }, include: { user: { select: { name: true, email: true } } } } } }),
    canCouriersView ? db.courier.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true, phone: true } }, city: true } }) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Aprovação de restaurantes" description="Candidaturas enviadas pelo formulário de parceiros. Só os restaurantes aprovados podem ser publicados." actions={<RefreshButton />} />
      <Card>
        <CardHeader title={`Restaurantes pendentes (${restaurants.length})`} />
        <CardBody>
          {restaurants.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="Sem candidaturas pendentes" description="As novas candidaturas de restaurantes aparecem aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {restaurants.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Thumb id={r.logoFileId} name={r.name} size="sm" />
                    <div className="min-w-0 text-sm">
                      <Link href={`/admin/restaurantes/${r.id}`} className="font-semibold hover:text-brand">{r.name}</Link>
                      <p className="text-muted">{r.responsibleName} · {formatPhone(r.phone)}{r.email ? ` · ${r.email}` : ""}</p>
                      <p className="text-muted">{r.addressLine}{r.neighborhood ? `, ${r.neighborhood.name}` : ""}, {r.city.name}</p>
                      <p className="text-muted">Enviada em {formatDate(r.createdAt)}{r.members[0] ? ` por ${r.members[0].user.name} (${r.members[0].user.email})` : ""}</p>
                    </div>
                  </div>
                  {canRestaurants && (
                    <div className="flex flex-wrap items-start gap-2">
                      <QuickAction action={restaurantStatusAction} hidden={{ id: r.id, status: "APPROVED" }} label="Aprovar" variant="accent" confirmMessage={`Aprovar ${r.name}?`} />
                      <ReasonForm action={restaurantStatusAction} hidden={{ id: r.id, status: "REJECTED" }} label="Rejeitar" variant="danger" placeholder="Motivo da rejeição (enviado ao restaurante)" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      {canCouriersView && (
        <Card className="mt-5">
          <CardHeader title={`Entregadores pendentes (${couriers.length})`} description="Verifique os documentos na ficha do entregador antes de aprovar." />
          <CardBody>
            {couriers.length === 0 ? <p className="text-sm text-muted">Sem candidaturas de entregadores pendentes.</p> : (
              <ul className="divide-y divide-line">
                {couriers.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div><Link href={`/admin/entregadores/${c.id}`} className="font-semibold hover:text-brand">{c.user.name}</Link><p className="text-muted">{c.city.name} · {c.user.email} · enviada em {formatDate(c.createdAt)}</p></div>
                    <Link href={`/admin/entregadores/${c.id}`} className="font-semibold text-brand">{canCouriers ? "Analisar documentos" : "Ver ficha"}</Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
