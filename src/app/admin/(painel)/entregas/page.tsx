import Link from "next/link";
import { Truck, AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { QuickAction } from "@/components/reason-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { DELIVERY_STATUS_LABEL, OrderStatusBadge, formatDate } from "@/components/status";
import { assignCourierAction, redispatchAction, resolveIssueAction } from "@/app/admin/actions";

export const metadata = { title: "Entregas" };

export default async function AdminDeliveries() {
  await requireAdmin("deliveries.manage");
  const [active, issues, couriers, availableCount] = await Promise.all([
    db.delivery.findMany({
      where: { status: { in: ["SEARCHING", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } },
      orderBy: { createdAt: "asc" },
      include: { order: { select: { id: true, code: true, status: true, neighborhoodName: true, restaurant: { select: { name: true } }, readyAt: true } }, courier: { include: { user: { select: { name: true } } } }, offers: { select: { status: true } } },
      take: 100,
    }),
    db.deliveryIssue.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: "desc" }, include: { delivery: { include: { order: { select: { id: true, code: true } } } }, courier: { include: { user: { select: { name: true } } } } }, take: 50 }),
    db.courier.findMany({ where: { status: "APPROVED" }, include: { user: { select: { name: true } } }, orderBy: [{ isAvailable: "desc" }] }),
    db.courier.count({ where: { status: "APPROVED", isAvailable: true } }),
  ]);
  const searching = active.filter((d) => d.status === "SEARCHING");
  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader title="Entregas" description="Entregas organizadas pela plataforma. Atribuição manual quando faltam entregadores." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sem entregador" value={searching.length} tone={searching.length ? "warn" : "neutral"} />
        <StatCard label="Em curso" value={active.length - searching.length} />
        <StatCard label="Entregadores disponíveis" value={availableCount} tone="accent" />
        <StatCard label="Problemas por resolver" value={issues.length} tone={issues.length ? "warn" : "neutral"} />
      </div>
      {active.length === 0 ? <EmptyState icon={Truck} title="Não há entregas em curso" /> : (
        <ul className="space-y-3">
          {active.map((d) => {
            const cityCouriers = couriers.filter((c) => c.cityId === d.cityId);
            const late = d.status === "SEARCHING" && d.order.readyAt && Date.now() - d.order.readyAt.getTime() > 10 * 60_000;
            return (
              <li key={d.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/pedidos/${d.order.id}`} className="font-semibold hover:text-brand">#{d.order.code} · {d.order.restaurant.name}</Link>
                  <div className="flex gap-2"><OrderStatusBadge status={d.order.status} /><Badge tone={d.status === "SEARCHING" ? "yellow" : "blue"}>{DELIVERY_STATUS_LABEL[d.status]}</Badge>{late && <Badge tone="red">Atraso</Badge>}</div>
                </div>
                <p className="mt-1 text-sm text-muted">Destino: {d.order.neighborhoodName} · criada {formatDate(d.createdAt, { timeStyle: "short" })} · ofertas enviadas: {d.offers.length} (recusadas: {d.offers.filter((o) => o.status === "DECLINED").length}, expiradas: {d.offers.filter((o) => o.status === "EXPIRED").length})</p>
                {d.courier && <p className="mt-1 text-sm">Entregador: <Link href={`/admin/entregadores/${d.courier.id}`} className="font-semibold text-brand">{d.courier.user.name}</Link></p>}
                {(d.status === "SEARCHING" || d.status === "ASSIGNED") && (
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    <ActionForm action={assignCourierAction} className="flex gap-2">
                      <input type="hidden" name="deliveryId" value={d.id} />
                      <Select name="courierId" required aria-label="Entregador" className="h-9 w-56">
                        <option value="">Atribuir a…</option>
                        {cityCouriers.map((c) => <option key={c.id} value={c.id}>{c.user.name}{c.isAvailable ? " (disponível)" : ""}</option>)}
                      </Select>
                      <SubmitButton size="sm">Atribuir</SubmitButton>
                    </ActionForm>
                    {d.status === "SEARCHING" && <QuickAction action={redispatchAction} hidden={{ deliveryId: d.id }} label="Reenviar ofertas" />}
                    {d.status === "ASSIGNED" && <QuickAction action={assignCourierAction} hidden={{ deliveryId: d.id, courierId: "" }} label="Libertar e reenviar" confirmMessage="Retirar a entrega a este entregador?" />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Card className="mt-6">
        <CardHeader title="Problemas reportados" />
        <CardBody>
          {issues.length === 0 ? <p className="text-sm text-muted">Sem problemas por resolver.</p> : (
            <ul className="divide-y divide-line">
              {issues.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" />{i.type} · <Link href={`/admin/pedidos/${i.delivery.order.id}`} className="text-brand">#{i.delivery.order.code}</Link></p>
                    <p className="text-muted">{i.description}</p>
                    <p className="text-xs text-muted">{i.courier?.user.name} · {formatDate(i.createdAt)}</p>
                  </div>
                  <QuickAction action={resolveIssueAction} hidden={{ id: i.id }} label="Marcar resolvido" />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
