import Link from "next/link";
import { ArrowDown, ArrowUp, FolderTree } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { RefreshButton } from "@/components/refresh-button";
import { adminCategoryAction, adminCategoryDeleteAction, adminCategoryMoveAction } from "@/app/admin/actions";

export const metadata = { title: "Categorias" };

/** Categorias do cardápio, por restaurante (cada restaurante organiza o seu cardápio). */
export default async function AdminCategories({ searchParams }: { searchParams: Promise<{ restaurante?: string; q?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin("restaurants.view");
  const manage = hasAdminPermission(user, "restaurants.manage");
  const restaurants = await db.restaurant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const current = restaurants.find((r) => r.id === sp.restaurante) ?? restaurants[0];
  const cats = current
    ? await db.menuCategory.findMany({
        where: { restaurantId: current.id, ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}) },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: { _count: { select: { products: { where: { status: { not: "ARCHIVED" } } } } } },
      })
    : [];
  return (
    <>
      <PageHeader title="Categorias do cardápio" description="Organizam os produtos de cada restaurante (ex.: Pratos principais, Bebidas)." actions={<RefreshButton />} />
      {!current ? (
        <EmptyState icon={FolderTree} title="Ainda não existem restaurantes" description="As categorias pertencem a um restaurante. Adicione primeiro um restaurante." action={manage ? <Link href="/admin/restaurantes/novo" className="font-semibold text-brand">Adicionar restaurante</Link> : undefined} />
      ) : (
        <>
          <FilterBar action="/admin/categorias" q={sp.q} qPlaceholder="Pesquisar categoria" clearHref="/admin/categorias">
            <FilterSelect name="restaurante" value={current.id} label="Restaurante" options={restaurants.map((r) => [r.id, r.name])} />
          </FilterBar>
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div>
              {cats.length === 0 ? (
                <EmptyState icon={FolderTree} title={sp.q ? "Nenhuma categoria encontrada" : `${current.name} ainda não tem categorias`} description="As categorias são opcionais: os produtos sem categoria aparecem no fim do cardápio." />
              ) : (
                <ul className="space-y-2">
                  {cats.map((c, i) => (
                    <li key={c.id} className="rounded-2xl border border-line bg-surface p-3">
                      <div className="flex items-center gap-2">
                        {manage && !sp.q && (
                          <div className="flex flex-col">
                            <QuickAction action={adminCategoryMoveAction} hidden={{ id: c.id, dir: "up" }} label={<ArrowUp className="h-4 w-4" aria-label="Subir" />} variant="ghost" />
                            <QuickAction action={adminCategoryMoveAction} hidden={{ id: c.id, dir: "down" }} label={<ArrowDown className="h-4 w-4" aria-label="Descer" />} variant="ghost" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{i + 1}. {c.name} {!c.isActive && <span className="text-xs text-muted">(oculta)</span>}</p>
                          <Link href={`/admin/produtos?restaurante=${current.id}&categoria=${c.id}`} className="text-xs text-muted hover:text-brand">{c._count.products} produto(s)</Link>
                        </div>
                        {manage && <QuickAction action={adminCategoryDeleteAction} hidden={{ id: c.id }} label="Eliminar" variant="ghost" confirmMessage="Eliminar a categoria? Os produtos não são apagados e ficam sem categoria." />}
                      </div>
                      {manage && (
                        <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary>
                          <ActionForm action={adminCategoryAction} className="mt-2 space-y-2">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="hasActive" value="1" />
                            <Input name="name" defaultValue={c.name} required minLength={2} maxLength={80} aria-label="Nome" />
                            <Input name="description" defaultValue={c.description ?? ""} placeholder="Descrição (opcional)" aria-label="Descrição" />
                            <Checkbox name="isActive" defaultChecked={c.isActive} label="Visível no cardápio" />
                            <SubmitButton size="sm">Guardar</SubmitButton>
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {manage && (
              <Card>
                <CardHeader title="Nova categoria" description={`Restaurante: ${current.name}`} />
                <CardBody>
                  <ActionForm action={adminCategoryAction} resetOnSuccess className="space-y-3">
                    <input type="hidden" name="restaurantId" value={current.id} />
                    <Field label="Nome da categoria" htmlFor="cname"><Input id="cname" name="name" required minLength={2} maxLength={80} /></Field>
                    <Field label="Descrição" htmlFor="cdesc"><Input id="cdesc" name="description" /></Field>
                    <SubmitButton className="w-full">Criar categoria</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}
