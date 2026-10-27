import Link from "next/link";
import { Search, Store, Receipt, Package, UserRound } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderStatusBadge, formatDate } from "@/components/status";
import { RestaurantOperationalBadge, UserStatusBadge } from "@/components/admin/restaurant-status";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Pesquisa" };

/** Pesquisa global no centro de controlo (só nas áreas que a conta pode ver). */
export default async function AdminSearch({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const user = await requireAdmin("dashboard.view");
  const can = { r: hasAdminPermission(user, "restaurants.view"), o: hasAdminPermission(user, "orders.view"), u: hasAdminPermission(user, "customers.view") };
  const digits = q.replace(/\D/g, "");
  const ci = { contains: q, mode: "insensitive" as const };
  const [restaurants, orders, products, users] = q.length < 2 ? [[], [], [], []] : await Promise.all([
    can.r ? db.restaurant.findMany({ where: { OR: [{ name: ci }, { email: ci }, { responsibleName: ci }] }, take: 8, orderBy: { name: "asc" } }) : [],
    can.o ? db.order.findMany({ where: { OR: [{ code: { contains: q.replace("#", "").toUpperCase() } }, { customerName: ci }] }, take: 8, orderBy: { createdAt: "desc" }, include: { restaurant: { select: { name: true } } } }) : [],
    can.r ? db.product.findMany({ where: { name: ci }, take: 8, orderBy: { name: "asc" }, include: { restaurant: { select: { name: true } } } }) : [],
    can.u ? db.user.findMany({ where: { OR: [{ name: ci }, { email: ci }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }, take: 8, orderBy: { createdAt: "desc" } }) : [],
  ]);
  const total = restaurants.length + orders.length + products.length + users.length;
  return (
    <>
      <PageHeader title="Pesquisa" description="Restaurantes, pedidos, produtos e contas, numa só pesquisa." />
      <form action="/admin/pesquisa" role="search" className="relative mb-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" type="search" defaultValue={q} autoFocus placeholder="Nome, código do pedido, e-mail ou telefone" aria-label="Pesquisa global" className="h-12 w-full rounded-2xl border border-line bg-surface pl-12 pr-4 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
      </form>
      {q.length < 2 ? (
        <EmptyState icon={Search} title="Escreva pelo menos 2 caracteres" description="Por exemplo, o nome de um restaurante, o código de um pedido ou o e-mail de uma conta." />
      ) : total === 0 ? (
        <EmptyState icon={Search} title={`Sem resultados para “${q}”`} description="Experimente outro termo." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          {restaurants.length > 0 && (
            <Card><CardHeader title="Restaurantes" /><CardBody><ul className="divide-y divide-line text-sm">{restaurants.map((r) => <li key={r.id}><Link href={`/admin/restaurantes/${r.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brand"><span className="flex min-w-0 items-center gap-2"><Store className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{r.name}</span></span><RestaurantOperationalBadge status={r.status} acceptingOrders={r.acceptingOrders} isListed={r.isListed} /></Link></li>)}</ul></CardBody></Card>
          )}
          {orders.length > 0 && (
            <Card><CardHeader title="Pedidos" /><CardBody><ul className="divide-y divide-line text-sm">{orders.map((o) => <li key={o.id}><Link href={`/admin/pedidos/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brand"><span className="flex min-w-0 items-center gap-2"><Receipt className="h-4 w-4 shrink-0 text-muted" /><span className="truncate"><span className="font-mono">#{o.code}</span> · {o.restaurant.name} · {formatMoney(o.totalCents, o.currency)}</span></span><OrderStatusBadge status={o.status} /></Link></li>)}</ul></CardBody></Card>
          )}
          {products.length > 0 && (
            <Card><CardHeader title="Produtos" /><CardBody><ul className="divide-y divide-line text-sm">{products.map((p) => <li key={p.id}><Link href={`/admin/produtos/${p.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brand"><span className="flex min-w-0 items-center gap-2"><Package className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{p.name} · {p.restaurant.name}</span></span><span className="tabular-nums">{formatMoney(p.priceCents)}</span></Link></li>)}</ul></CardBody></Card>
          )}
          {users.length > 0 && (
            <Card><CardHeader title="Contas" /><CardBody><ul className="divide-y divide-line text-sm">{users.map((u) => <li key={u.id}><Link href={`/admin/utilizadores/${u.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-brand"><span className="flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{u.name} · {u.email ?? "—"}</span></span><span className="flex items-center gap-2"><span className="hidden text-xs text-muted sm:inline">{formatDate(u.createdAt, { dateStyle: "short" })}</span><UserStatusBadge status={u.status} /></span></Link></li>)}</ul></CardBody></Card>
          )}
        </div>
      )}
    </>
  );
}
