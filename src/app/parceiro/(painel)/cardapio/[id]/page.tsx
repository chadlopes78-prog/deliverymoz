import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { ProductEditor, type ProductInitial } from "@/components/partner/product-editor";
import { centsToInput } from "@/lib/money";
import { minutesToTime } from "@/lib/utils";
import { fileUrl } from "@/server/storage/files";
import { productAction } from "../../../actions";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePartner("menu.manage");
  const settings = await getSettings();
  const categories = await db.menuCategory.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: { position: "asc" }, select: { id: true, name: true } });
  let initial: ProductInitial | undefined;
  if (id !== "novo") {
    const p = await db.product.findUnique({ where: { id }, include: { optionGroups: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } } });
    // Isolamento: um produto de outro restaurante é tratado como inexistente.
    if (!p || p.restaurantId !== ctx.restaurantId) notFound();
    initial = {
      id: p.id, name: p.name, description: p.description, price: centsToInput(p.priceCents), categoryId: p.categoryId, paused: p.status === "PAUSED", isFeatured: p.isFeatured,
      availableFrom: p.availableFrom != null ? minutesToTime(p.availableFrom) : "", availableUntil: p.availableUntil != null ? minutesToTime(p.availableUntil) : "", prepTimeMinutes: p.prepTimeMinutes?.toString() ?? "",
      imageUrl: fileUrl(p.imageFileId),
      groups: p.optionGroups.map((g) => ({ name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, options: g.options.map((o) => ({ name: o.name, price: centsToInput(o.priceDeltaCents), isAvailable: o.isAvailable })) })),
    };
  }
  return (
    <div className="max-w-3xl">
      <Link href="/parceiro/cardapio" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Cardápio</Link>
      <PageHeader title={initial ? "Editar produto" : "Novo produto"} />
      <ProductEditor action={productAction} categories={categories} initial={initial} currency={settings.currency} />
    </div>
  );
}
