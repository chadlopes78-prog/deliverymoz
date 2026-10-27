import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductEditor, type ProductInitial } from "@/components/partner/product-editor";
import { centsToInput, formatMoney } from "@/lib/money";
import { minutesToTime } from "@/lib/utils";
import { fileUrl } from "@/server/storage/files";
import { formatDate } from "@/components/status";
import { adminProductAction } from "@/app/admin/actions";

export const metadata = { title: "Produto" };

export default async function AdminProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ restaurante?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireAdmin(id === "novo" ? "restaurants.manage" : "restaurants.view");
  const manage = hasAdminPermission(user, "restaurants.manage");
  const settings = await getSettings();
  const [restaurants, categories] = await Promise.all([
    db.restaurant.findMany({ where: { status: { not: "REJECTED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.menuCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, restaurantId: true } }),
  ]);
  let initial: ProductInitial | undefined;
  let restaurantId = sp.restaurante && restaurants.some((r) => r.id === sp.restaurante) ? sp.restaurante : restaurants.length === 1 ? restaurants[0].id : undefined;
  let info: { restaurant: string; orders: number; createdAt: Date; updatedAt: Date; status: string; price: number } | null = null;
  if (id !== "novo") {
    const p = await db.product.findUnique({
      where: { id },
      include: { restaurant: { select: { id: true, name: true } }, _count: { select: { orderItems: true } }, optionGroups: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } },
    });
    if (!p) notFound();
    restaurantId = p.restaurantId;
    if (!restaurants.some((r) => r.id === p.restaurantId)) restaurants.push(p.restaurant);
    info = { restaurant: p.restaurant.name, orders: p._count.orderItems, createdAt: p.createdAt, updatedAt: p.updatedAt, status: p.status, price: p.priceCents };
    initial = {
      id: p.id, name: p.name, description: p.description, price: centsToInput(p.priceCents), categoryId: p.categoryId, paused: p.status === "PAUSED", isFeatured: p.isFeatured,
      availableFrom: p.availableFrom != null ? minutesToTime(p.availableFrom) : "", availableUntil: p.availableUntil != null ? minutesToTime(p.availableUntil) : "",
      prepTimeMinutes: p.prepTimeMinutes?.toString() ?? "",
      imageUrl: fileUrl(p.imageFileId),
      groups: p.optionGroups.map((g) => ({ name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, options: g.options.map((o) => ({ name: o.name, price: centsToInput(o.priceDeltaCents), isAvailable: o.isAvailable })) })),
    };
  }
  return (
    <div className="max-w-3xl">
      <Link href="/admin/produtos" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Produtos</Link>
      <PageHeader title={initial ? initial.name : "Adicionar produto"} description={initial ? undefined : "O produto fica associado ao restaurante escolhido e aparece no site quando estiver disponível e o restaurante estiver publicado."} />
      {info && (
        <Card className="mb-5">
          <CardHeader title="Detalhes" />
          <CardBody className="grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-muted">Restaurante:</span> {info.restaurant}</p>
            <p><span className="text-muted">Preço atual:</span> {formatMoney(info.price, settings.currency)}</p>
            <p><span className="text-muted">Estado:</span> <Badge tone={info.status === "ACTIVE" ? "green" : info.status === "PAUSED" ? "yellow" : "neutral"}>{{ ACTIVE: "Disponível", PAUSED: "Indisponível", ARCHIVED: "Arquivado" }[info.status]}</Badge></p>
            <p><span className="text-muted">Vendido em:</span> {info.orders} item(ns) de pedidos</p>
            <p><span className="text-muted">Criado:</span> {formatDate(info.createdAt)}</p>
            <p><span className="text-muted">Atualizado:</span> {formatDate(info.updatedAt)}</p>
          </CardBody>
        </Card>
      )}
      {restaurants.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Crie primeiro um restaurante em <Link href="/admin/restaurantes/novo" className="font-semibold underline">Restaurantes → Adicionar restaurante</Link>.</p>
      ) : manage ? (
        <ProductEditor action={adminProductAction} restaurants={restaurants} restaurantId={restaurantId} categories={categories} initial={initial} currency={settings.currency} />
      ) : (
        <p className="text-sm text-muted">Não tem permissão para editar produtos.</p>
      )}
    </div>
  );
}
