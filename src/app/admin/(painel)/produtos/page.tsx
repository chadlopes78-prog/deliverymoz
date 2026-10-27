import Link from "next/link";
import type { Prisma, ProductStatus } from "@prisma/client";
import { Package, Plus } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { hasAdminPermission } from "@/server/permissions";
import { getSettings } from "@/server/services/settings";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button-class";
import { ActionForm } from "@/components/ui/action-form";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { QuickAction } from "@/components/reason-form";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { RefreshButton } from "@/components/refresh-button";
import { centsToInput, formatMoney } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";
import { adminProductStatusAction, adminProductDeleteAction, adminProductPriceAction } from "@/app/admin/actions";

export const metadata = { title: "Produtos" };

const STATUS_LABEL: Record<ProductStatus, string> = { ACTIVE: "Disponível", PAUSED: "Indisponível", ARCHIVED: "Arquivado" };
const STATUS_TONE = { ACTIVE: "green", PAUSED: "yellow", ARCHIVED: "neutral" } as const;

type SP = { q?: string; restaurante?: string; categoria?: string; disponibilidade?: string; pagina?: string; guardado?: string };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireAdmin("restaurants.view");
  const manage = hasAdminPermission(user, "restaurants.manage");
  const { page, pageSize, skip, take } = pageParams(sp);
  const status = sp.disponibilidade && sp.disponibilidade in STATUS_LABEL ? (sp.disponibilidade as ProductStatus) : null;
  const where: Prisma.ProductWhereInput = {
    status: status ?? { in: ["ACTIVE", "PAUSED"] },
    ...(sp.restaurante ? { restaurantId: sp.restaurante } : {}),
    ...(sp.categoria ? { categoryId: sp.categoria } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, restaurants, categories, settings, anyProduct] = await Promise.all([
    db.product.findMany({ where, skip, take, orderBy: [{ updatedAt: "desc" }], include: { restaurant: { select: { id: true, name: true } }, category: { select: { name: true } } } }),
    db.product.count({ where }),
    db.restaurant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.menuCategory.findMany({ where: sp.restaurante ? { restaurantId: sp.restaurante } : {}, orderBy: [{ restaurant: { name: "asc" } }, { position: "asc" }], select: { id: true, name: true, restaurant: { select: { name: true } } } }),
    getSettings(),
    db.product.count({ take: 1 }),
  ]);
  const cur = settings.currency;
  const filtered = !!(sp.q || sp.restaurante || sp.categoria || sp.disponibilidade);
  const addHref = sp.restaurante ? `/admin/produtos/novo?restaurante=${sp.restaurante}` : "/admin/produtos/novo";
  return (
    <>
      <PageHeader
        title="Gestão de produtos"
        description="Produtos de todos os restaurantes. Os preços são em meticais e ficam registados em cada pedido no momento da compra."
        actions={<><RefreshButton />{manage && <Link href={addHref} className={buttonClass("primary", "sm")}><Plus className="h-4 w-4" /> Adicionar produto</Link>}</>}
      />
      {sp.guardado && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Produto criado com sucesso.</p>}
      <FilterBar action="/admin/produtos" q={sp.q} qPlaceholder="Pesquisar produto" clearHref="/admin/produtos">
        <FilterSelect name="restaurante" value={sp.restaurante} label="Todos os restaurantes" options={restaurants.map((r) => [r.id, r.name])} />
        <FilterSelect name="categoria" value={sp.categoria} label="Todas as categorias" options={categories.map((c) => [c.id, sp.restaurante ? c.name : `${c.name} · ${c.restaurant.name}`])} />
        <FilterSelect name="disponibilidade" value={sp.disponibilidade} label="Disponíveis e indisponíveis" options={Object.entries(STATUS_LABEL)} />
      </FilterBar>
      {restaurants.length === 0 && manage && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Para adicionar produtos, crie primeiro um restaurante em <Link href="/admin/restaurantes/novo" className="font-semibold underline">Gestão comercial → Restaurantes</Link>.</p>
      )}
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        rowHref={(p) => `/admin/produtos/${p.id}`}
        empty={
          anyProduct === 0 && !filtered ? (
            <EmptyState icon={Package} title="Ainda não adicionaste produtos. Clica em Adicionar produto para começar." action={manage && restaurants.length > 0 ? <Link href={addHref} className={buttonClass()}><Plus className="h-4 w-4" /> Adicionar produto</Link> : undefined} />
          ) : (
            <EmptyState icon={Package} title="Nenhum produto encontrado" description="Ajuste a pesquisa ou os filtros." />
          )
        }
        columns={[
          {
            key: "n", header: "Produto", primary: true,
            cell: (p) => (
              <span className="flex min-w-0 items-center gap-3">
                {p.imageFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p.imageFileId)!} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-ink/5 text-[10px] text-muted">Sem foto</span>}
                <span className="min-w-0 truncate">{p.name}</span>
              </span>
            ),
          },
          { key: "r", header: "Restaurante", interactive: true, cell: (p) => <Link href={`/admin/restaurantes/${p.restaurant.id}`} className="hover:text-brand">{p.restaurant.name}</Link> },
          { key: "c", header: "Categoria", cell: (p) => p.category?.name ?? <span className="text-muted">Sem categoria</span>, hideOnMobile: true },
          {
            key: "p", header: `Preço (${cur})`, interactive: true,
            cell: (p) => manage && p.status !== "ARCHIVED" ? (
              <ActionForm action={adminProductPriceAction} className="flex items-center gap-1">
                <input type="hidden" name="id" value={p.id} />
                <Input name="price" defaultValue={centsToInput(p.priceCents)} inputMode="decimal" required aria-label={`Preço de ${p.name}`} className="h-9 w-24" />
                <SubmitButton size="sm" variant="ghost">OK</SubmitButton>
              </ActionForm>
            ) : <span className="tabular-nums">{formatMoney(p.priceCents, cur)}</span>,
          },
          { key: "s", header: "Disponibilidade", cell: (p) => <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge> },
          {
            key: "a", header: "Ações", interactive: true,
            cell: (p) => (
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/admin/produtos/${p.id}`} className={buttonClass("outline", "sm")}>{manage ? "Editar" : "Ver"}</Link>
                {manage && p.status === "ARCHIVED" && <QuickAction action={adminProductStatusAction} hidden={{ id: p.id, status: "PAUSED" }} label="Restaurar" />}
                {manage && p.status !== "ARCHIVED" && <QuickAction action={adminProductStatusAction} hidden={{ id: p.id, status: p.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }} label={p.status === "ACTIVE" ? "Desativar" : "Ativar"} variant={p.status === "ACTIVE" ? "outline" : "accent"} />}
                {manage && p.status !== "ARCHIVED" && <QuickAction action={adminProductDeleteAction} hidden={{ id: p.id }} label="Eliminar" variant="ghost" confirmMessage="Eliminar este produto? Se já tiver pedidos, será arquivado para preservar o histórico." />}
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/produtos" params={{ q: sp.q, restaurante: sp.restaurante, categoria: sp.categoria, disponibilidade: sp.disponibilidade }} />
    </>
  );
}
