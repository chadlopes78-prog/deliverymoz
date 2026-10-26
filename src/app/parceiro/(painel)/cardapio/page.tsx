import Link from "next/link";
import { Plus, UtensilsCrossed } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button-class";
import { QuickAction } from "@/components/reason-form";
import { formatMoney } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";
import { productStatusAction, productDeleteAction } from "../../actions";

export const metadata = { title: "Cardápio" };

export default async function Menu({ searchParams }: { searchParams: Promise<{ arquivados?: string; guardado?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner("menu.manage");
  const settings = await getSettings();
  const [categories, products] = await Promise.all([
    db.menuCategory.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.product.findMany({ where: { restaurantId: ctx.restaurantId, status: sp.arquivados ? "ARCHIVED" : { in: ["ACTIVE", "PAUSED"] } }, orderBy: [{ position: "asc" }, { name: "asc" }], include: { _count: { select: { optionGroups: true } } } }),
  ]);
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name, products: products.filter((p) => p.categoryId === c.id) })), { id: "none", name: "Sem categoria", products: products.filter((p) => !p.categoryId) }].filter((g) => g.products.length);
  return (
    <>
      <PageHeader title="Cardápio" description={`${products.length} produto(s) ${sp.arquivados ? "arquivados" : "no cardápio"}`} actions={<>
        <Link href={sp.arquivados ? "/parceiro/cardapio" : "/parceiro/cardapio?arquivados=1"} className={buttonClass("outline", "sm")}>{sp.arquivados ? "Ver cardápio" : "Arquivados"}</Link>
        <Link href="/parceiro/cardapio/novo" className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" /> Novo produto</Link>
      </>} />
      {sp.guardado && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Produto criado com sucesso.</p>}
      {products.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title={sp.arquivados ? "Sem produtos arquivados" : "Este restaurante ainda não adicionou produtos ao seu cardápio."} description={sp.arquivados ? undefined : "Crie categorias (opcional) e adicione o primeiro produto com preço, descrição e fotografia."} action={!sp.arquivados && <Link href="/parceiro/cardapio/novo" className={buttonClass()}>Adicionar primeiro produto</Link>} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.id}>
              <h2 className="mb-2 font-bold">{g.name}</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {g.products.map((p) => (
                  <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <Link href={`/parceiro/cardapio/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      {p.imageFileId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(p.imageFileId)!} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      ) : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-ink/5 text-xs text-muted">Sem foto</span>}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold hover:text-brand">{p.name}</span>
                        <span className="text-sm">{formatMoney(p.priceCents, settings.currency)}</span>
                        <span className="ml-2 inline-flex gap-1">{p.status === "PAUSED" && <Badge tone="yellow">Pausado</Badge>}{p.isFeatured && <Badge tone="brand">Destaque</Badge>}{p._count.optionGroups > 0 && <Badge>{p._count.optionGroups} grupo(s) de opções</Badge>}</span>
                      </span>
                    </Link>
                    <div className="flex flex-wrap gap-2">
                      {p.status === "ARCHIVED" ? (
                        <QuickAction action={productStatusAction} hidden={{ id: p.id, status: "PAUSED" }} label="Restaurar (pausado)" />
                      ) : (
                        <QuickAction action={productStatusAction} hidden={{ id: p.id, status: p.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }} label={p.status === "ACTIVE" ? "Pausar" : "Ativar"} variant={p.status === "ACTIVE" ? "outline" : "accent"} />
                      )}
                      {p.status !== "ARCHIVED" && <QuickAction action={productDeleteAction} hidden={{ id: p.id }} label="Eliminar" variant="ghost" confirmMessage="Eliminar este produto? Se já tiver pedidos, será arquivado para preservar o histórico." />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
