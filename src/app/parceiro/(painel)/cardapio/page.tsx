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
import { cn } from "@/lib/utils";
import { productStatusAction, productDeleteAction } from "../../actions";

export const metadata = { title: "Cardápio" };

export default async function Menu({ searchParams }: { searchParams: Promise<{ arquivados?: string; guardado?: string; q?: string; categoria?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePartner("menu.manage");
  const settings = await getSettings();
  const [categories, products] = await Promise.all([
    db.menuCategory.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.product.findMany({
      where: {
        restaurantId: ctx.restaurantId,
        status: sp.arquivados ? "ARCHIVED" : { in: ["ACTIVE", "PAUSED"] },
        ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}),
        ...(sp.categoria === "sem" ? { categoryId: null } : sp.categoria ? { categoryId: sp.categoria } : {}),
      },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { optionGroups: true } } },
    }),
  ]);
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name, products: products.filter((p) => p.categoryId === c.id) })), { id: "none", name: "Sem categoria", products: products.filter((p) => !p.categoryId) }].filter((g) => g.products.length);
  const filtered = !!(sp.q || sp.categoria);
  const chip = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={cn("flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm font-semibold", active ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent")}>{label}</Link>
  );
  const base = sp.arquivados ? "/parceiro/cardapio?arquivados=1&" : "/parceiro/cardapio?";
  return (
    <>
      <PageHeader title="Cardápio" description={`${products.length} produto(s) ${sp.arquivados ? "arquivados" : "no cardápio"}`} actions={<>
        <Link href={sp.arquivados ? "/parceiro/cardapio" : "/parceiro/cardapio?arquivados=1"} className={buttonClass("outline", "sm")}>{sp.arquivados ? "Ver cardápio" : "Arquivados"}</Link>
        <Link href="/parceiro/cardapio/novo" className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" /> Novo produto</Link>
      </>} />
      {sp.guardado && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Produto criado com sucesso.</p>}
      <form action="/parceiro/cardapio" role="search" className="mb-3 flex gap-2">
        {sp.arquivados && <input type="hidden" name="arquivados" value="1" />}
        {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
        <input name="q" defaultValue={sp.q ?? ""} type="search" placeholder="Pesquisar no cardápio" aria-label="Pesquisar no cardápio" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" />
        <button className={buttonClass("outline")}>Pesquisar</button>
      </form>
      {categories.length > 0 && (
        <nav className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Categorias do cardápio">
          {chip(`${base}${sp.q ? `q=${encodeURIComponent(sp.q)}` : ""}`, "Todas", !sp.categoria)}
          {categories.map((c) => chip(`${base}categoria=${c.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`, c.name, sp.categoria === c.id))}
          {chip(`${base}categoria=sem`, "Sem categoria", sp.categoria === "sem")}
        </nav>
      )}
      {products.length === 0 ? (
        filtered ? <EmptyState icon={UtensilsCrossed} title="Nenhum produto encontrado" description="Ajuste a pesquisa ou a categoria." />
        : <EmptyState icon={UtensilsCrossed} title={sp.arquivados ? "Sem produtos arquivados" : "Este restaurante ainda não adicionou produtos ao seu cardápio."} description={sp.arquivados ? undefined : "Crie categorias (opcional) e adicione o primeiro produto com preço, descrição e fotografia."} action={!sp.arquivados && <Link href="/parceiro/cardapio/novo" className={buttonClass()}>Adicionar primeiro produto</Link>} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`cat-${g.id}`}>
              <h2 id={`cat-${g.id}`} className="mb-3 text-sm font-bold uppercase tracking-wide text-accent">{g.name}</h2>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {g.products.map((p) => (
                  <li key={p.id} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                    <Link href={`/parceiro/cardapio/${p.id}`} className="group block">
                      <div className="relative aspect-[4/3] bg-ink/5">
                        {p.imageFileId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fileUrl(p.imageFileId)!} alt="" loading="lazy" className={cn("h-full w-full object-cover", p.status !== "ACTIVE" && "opacity-60 grayscale")} />
                        ) : <span className="grid h-full place-items-center text-xs text-muted">Sem fotografia</span>}
                        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                          {p.status === "PAUSED" && <Badge tone="yellow">Indisponível</Badge>}
                          {p.isFeatured && <Badge tone="brand">Destaque</Badge>}
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="truncate font-semibold group-hover:text-accent">{p.name}</p>
                        <p className="text-sm font-bold tabular-nums">{formatMoney(p.priceCents, settings.currency)}</p>
                        {p._count.optionGroups > 0 && <p className="text-xs text-muted">{p._count.optionGroups} grupo(s) de opções</p>}
                      </div>
                    </Link>
                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line p-2">
                      {p.status === "ARCHIVED" ? (
                        <QuickAction action={productStatusAction} hidden={{ id: p.id, status: "PAUSED" }} label="Restaurar" />
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
