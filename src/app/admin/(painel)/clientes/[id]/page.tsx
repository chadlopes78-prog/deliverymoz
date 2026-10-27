import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ReasonForm, QuickAction } from "@/components/reason-form";
import { UserStatusBadge } from "@/components/admin/restaurant-status";
import { OrderStatusBadge, formatDate } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/utils";
import { TICKET_STATUS_LABEL } from "@/server/services/support";
import { userStatusAction } from "@/app/admin/actions";

export default async function AdminCustomer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin("customers.view");
  const u = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, phone: true, status: true, suspendedReason: true, createdAt: true, lastLoginAt: true, isSuperAdmin: true,
      staff: true, courier: { select: { id: true, status: true } }, restaurantMembers: { include: { restaurant: { select: { id: true, name: true } } } },
      orders: { orderBy: { createdAt: "desc" }, take: 20, include: { restaurant: { select: { name: true } } } },
      tickets: { orderBy: { createdAt: "desc" }, take: 10 },
      addresses: { include: { neighborhood: true, city: true } },
      _count: { select: { orders: true, reviews: true } },
    },
  });
  if (!u || u.isSuperAdmin) notFound();
  const manage = hasAdminPermission(admin, "customers.manage") && u.status !== "CLOSED";
  const spent = await db.order.aggregate({ where: { customerId: u.id, status: "DELIVERED" }, _sum: { totalCents: true } });
  return (
    <>
      <Link href="/admin/clientes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Clientes</Link>
      <PageHeader title={u.name} description={`Registado em ${formatDate(u.createdAt, { dateStyle: "medium" })} · último acesso ${formatDate(u.lastLoginAt)}`} actions={<UserStatusBadge status={u.status} />} />
      {manage && !u.staff && (
        <div className="mb-5 flex flex-wrap gap-2">
          {u.status === "ACTIVE" ? <ReasonForm action={userStatusAction} hidden={{ id: u.id, status: "SUSPENDED" }} label="Suspender conta" variant="danger" /> : <QuickAction action={userStatusAction} hidden={{ id: u.id, status: "ACTIVE" }} label="Reativar conta" variant="accent" />}
        </div>
      )}
      {u.suspendedReason && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Motivo da suspensão: {u.suspendedReason}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contacto" description="Palavras-passe e dados de pagamento nunca são apresentados." />
          <CardBody className="space-y-1 text-sm">
            <p><span className="text-muted">E-mail:</span> {u.email ?? "—"}</p>
            <p><span className="text-muted">Telefone:</span> {formatPhone(u.phone) || "—"}</p>
            <p><span className="text-muted">Pedidos:</span> {u._count.orders} · <span className="text-muted">Avaliações:</span> {u._count.reviews} · <span className="text-muted">Total entregue:</span> {formatMoney(spent._sum.totalCents ?? 0)}</p>
            {u.courier && <p><Link className="text-brand underline" href={`/admin/entregadores/${u.courier.id}`}>Perfil de entregador</Link></p>}
            {u.restaurantMembers.map((m) => <p key={m.id}><Link className="text-brand underline" href={`/admin/restaurantes/${m.restaurant.id}`}>{m.restaurant.name}</Link></p>)}
            {u.addresses.length > 0 && <div className="pt-2"><p className="font-semibold">Endereços</p>{u.addresses.map((a) => <p key={a.id} className="text-muted">{a.label}: {a.street}, {a.neighborhood.name}, {a.city.name}</p>)}</div>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Suporte e reclamações" />
          <CardBody>
            {u.tickets.length === 0 ? <p className="text-sm text-muted">Sem pedidos de suporte.</p> : (
              <ul className="space-y-2 text-sm">{u.tickets.map((t) => <li key={t.id}><Link href={`/admin/suporte/${t.id}`} className="flex justify-between gap-2 hover:text-brand"><span className="truncate">{t.subject}</span><Badge>{TICKET_STATUS_LABEL[t.status]}</Badge></Link></li>)}</ul>
            )}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Histórico de pedidos" />
        <CardBody>
          {u.orders.length === 0 ? <p className="text-sm text-muted">Sem pedidos.</p> : (
            <ul className="divide-y divide-line text-sm">
              {u.orders.map((o) => <li key={o.id}><Link href={`/admin/pedidos/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:text-brand"><span className="font-mono">#{o.code}</span><span className="text-muted">{o.restaurant.name}</span><span>{formatDate(o.createdAt)}</span><span className="tabular-nums">{formatMoney(o.totalCents, o.currency)}</span><OrderStatusBadge status={o.status} /></Link></li>)}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
