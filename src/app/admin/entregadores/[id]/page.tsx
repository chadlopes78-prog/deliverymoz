import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { courierEarnings } from "@/server/services/finance";
import { VEHICLE_LABEL } from "@/server/services/couriers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat";
import { ReasonForm, QuickAction } from "@/components/reason-form";
import { CourierStatusBadge } from "@/components/admin/restaurant-status";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, DELIVERY_STATUS_LABEL } from "@/components/status";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/utils";
import { fileUrl } from "@/server/storage/files";
import { courierStatusAction, courierPayoutAction } from "../../actions";

const DOC_LABEL: Record<string, string> = { ID_CARD: "Documento de identificação", DRIVER_LICENSE: "Carta de condução", VEHICLE_REGISTRATION: "Livrete do veículo", OTHER: "Outro" };

export default async function AdminCourier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin("couriers.view");
  const c = await db.courier.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, phone: true, id: true } }, city: true, documents: true,
      deliveries: { orderBy: { createdAt: "desc" }, take: 15, include: { order: { select: { code: true, id: true, restaurant: { select: { name: true } } } } } },
      issues: { orderBy: { createdAt: "desc" }, take: 10 },
      payouts: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!c) notFound();
  const earnings = await courierEarnings(c.id);
  const manage = hasAdminPermission(admin, "couriers.manage");
  return (
    <>
      <Link href="/admin/entregadores" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Entregadores</Link>
      <PageHeader title={c.user.name} description={`${c.city.name} · ${VEHICLE_LABEL[c.vehicleType]}${c.vehiclePlate ? ` (${c.vehiclePlate})` : ""}`} actions={<CourierStatusBadge status={c.status} />} />
      {manage && (
        <div className="mb-5 flex flex-wrap items-start gap-2">
          {c.status !== "APPROVED" && <QuickAction action={courierStatusAction} hidden={{ id: c.id, status: "APPROVED" }} label={c.status === "SUSPENDED" ? "Reativar" : "Aprovar"} variant="accent" confirmMessage="Confirma que verificou os documentos?" />}
          {c.status === "PENDING" && <ReasonForm action={courierStatusAction} hidden={{ id: c.id, status: "REJECTED" }} label="Rejeitar" variant="danger" />}
          {c.status === "APPROVED" && <ReasonForm action={courierStatusAction} hidden={{ id: c.id, status: "SUSPENDED" }} label="Suspender" variant="danger" />}
        </div>
      )}
      {c.statusReason && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Motivo: {c.statusReason}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Entregas concluídas" value={earnings.deliveredCount} />
        <StatCard label="Canceladas" value={earnings.cancelledCount} />
        <StatCard label="Valor calculado" value={formatMoney(earnings.earnedCents)} hint={`Por pagar: ${formatMoney(earnings.unpaidCents)}`} />
        <StatCard label="Numerário recebido" value={formatMoney(earnings.cashCollectedCents)} hint="Pedidos pagos na entrega" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dados" />
          <CardBody className="space-y-1 text-sm">
            <p><span className="text-muted">Telefone:</span> {formatPhone(c.user.phone)}</p>
            <p><span className="text-muted">E-mail:</span> {c.user.email ?? "—"}</p>
            <p><span className="text-muted">N.º identificação:</span> {c.idNumber ?? "—"}</p>
            <p><span className="text-muted">Disponível:</span> {c.isAvailable ? "sim" : "não"} · <span className="text-muted">Última localização:</span> {c.lastLocationAt ? formatDate(c.lastLocationAt) : "nunca partilhada"}</p>
            {hasAdminPermission(admin, "finance.view") && <p className="whitespace-pre-line"><span className="text-muted">Dados de pagamento:</span> {c.payoutDetails ?? "não indicados"}</p>}
            <div className="pt-2">
              <p className="font-semibold">Documentos (privados)</p>
              {c.documents.length === 0 ? <p className="text-muted">Nenhum documento.</p> : <ul className="mt-1 space-y-1">{c.documents.map((d) => <li key={d.id}><a href={fileUrl(d.fileId)!} target="_blank" className="inline-flex items-center gap-1 text-brand underline"><FileText className="h-4 w-4" /> {DOC_LABEL[d.type] ?? d.type}</a> <span className="text-xs text-muted">{formatDate(d.createdAt, { dateStyle: "short" })}</span></li>)}</ul>}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Pagamentos ao entregador" description="Registo de pagamentos feitos fora do sistema (ex.: transferência M-Pesa)." />
          <CardBody>
            {hasAdminPermission(admin, "finance.manage") && earnings.unpaidCount > 0 && (
              <ActionForm action={courierPayoutAction} className="mb-4 flex flex-col gap-2 sm:flex-row" confirmMessage={`Registar pagamento de ${formatMoney(earnings.unpaidCents)}?`}>
                <input type="hidden" name="courierId" value={c.id} />
                <Input name="reference" required placeholder="Referência da transferência" aria-label="Referência" />
                <SubmitButton variant="accent">Registar pagamento ({formatMoney(earnings.unpaidCents)})</SubmitButton>
              </ActionForm>
            )}
            {c.payouts.length === 0 ? <p className="text-sm text-muted">Sem pagamentos registados.</p> : <ul className="space-y-1 text-sm">{c.payouts.map((p) => <li key={p.id} className="flex justify-between"><span>{formatDate(p.paidAt ?? p.createdAt, { dateStyle: "short" })} · {p.reference}</span><span className="font-semibold">{formatMoney(p.amountCents, p.currency)}</span></li>)}</ul>}
          </CardBody>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Entregas recentes" />
          <CardBody>
            {c.deliveries.length === 0 ? <p className="text-sm text-muted">Sem entregas.</p> : <ul className="space-y-2 text-sm">{c.deliveries.map((d) => <li key={d.id}><Link href={`/admin/pedidos/${d.order.id}`} className="flex justify-between gap-2 hover:text-brand"><span className="font-mono">#{d.order.code}</span><span className="truncate text-muted">{d.order.restaurant.name}</span><Badge>{DELIVERY_STATUS_LABEL[d.status]}</Badge></Link></li>)}</ul>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Problemas reportados" />
          <CardBody>
            {c.issues.length === 0 ? <p className="text-sm text-muted">Nenhum problema reportado.</p> : <ul className="space-y-2 text-sm">{c.issues.map((i) => <li key={i.id}><p className="font-semibold">{i.type} {i.resolvedAt && <Badge tone="green">Resolvido</Badge>}</p><p className="text-muted">{i.description}</p></li>)}</ul>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
