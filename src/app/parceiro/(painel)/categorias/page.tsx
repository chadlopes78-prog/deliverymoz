import { FolderTree, ArrowUp, ArrowDown } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { categoryAction, categoryDeleteAction, categoryMoveAction } from "../../actions";

export const metadata = { title: "Categorias" };

export default async function Categories() {
  const ctx = await requirePartner("menu.manage");
  const cats = await db.menuCategory.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader title="Categorias do cardápio" description="Organizam o cardápio (ex.: Entradas, Pratos principais, Bebidas)." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          {cats.length === 0 ? <EmptyState icon={FolderTree} title="Ainda não existem categorias" /> : (
            <ul className="space-y-2">
              {cats.map((c, i) => (
                <li key={c.id} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <QuickAction action={categoryMoveAction} hidden={{ id: c.id, dir: "up" }} label={<ArrowUp className="h-4 w-4" aria-label="Subir" />} variant="ghost" />
                      <QuickAction action={categoryMoveAction} hidden={{ id: c.id, dir: "down" }} label={<ArrowDown className="h-4 w-4" aria-label="Descer" />} variant="ghost" />
                    </div>
                    <div className="min-w-0 flex-1"><p className="font-semibold">{i + 1}. {c.name} {!c.isActive && <span className="text-xs text-muted">(oculta)</span>}</p><p className="text-xs text-muted">{c._count.products} produto(s)</p></div>
                    <QuickAction action={categoryDeleteAction} hidden={{ id: c.id }} label="Eliminar" variant="ghost" confirmMessage="Eliminar a categoria? Os produtos não são apagados." />
                  </div>
                  <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-brand">Editar</summary>
                    <ActionForm action={categoryAction} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="hasActive" value="1" />
                      <Input name="name" defaultValue={c.name} required aria-label="Nome" />
                      <Input name="description" defaultValue={c.description ?? ""} placeholder="Descrição (opcional)" aria-label="Descrição" />
                      <Checkbox name="isActive" defaultChecked={c.isActive} label="Visível no cardápio" />
                      <SubmitButton size="sm">Guardar</SubmitButton>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <CardHeader title="Nova categoria" />
          <CardBody>
            <ActionForm action={categoryAction} resetOnSuccess className="space-y-3">
              <Field label="Nome" htmlFor="cname"><Input id="cname" name="name" required /></Field>
              <Field label="Descrição" htmlFor="cdesc"><Input id="cdesc" name="description" /></Field>
              <SubmitButton className="w-full">Criar</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
