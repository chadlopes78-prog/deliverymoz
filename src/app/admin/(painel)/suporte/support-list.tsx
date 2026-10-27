import type { Prisma, TicketCategory, TicketStatus } from "@prisma/client";
import { LifeBuoy } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { TICKET_CATEGORY_LABEL, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL } from "@/server/services/support";
import { formatDate } from "@/components/status";

export type SupportSP = { q?: string; estado?: string; categoria?: string; pagina?: string };

/** Lista de tickets, reutilizada em "Reclamações" e "Pedidos de ajuda" (filtradas por categoria). */
export async function SupportList({ sp, base, title, categories }: { sp: SupportSP; base: string; title: string; categories?: TicketCategory[] }) {
  await requireAdmin("support.manage");
  const allowed = categories ?? (Object.keys(TICKET_CATEGORY_LABEL) as TicketCategory[]);
  const cat = sp.categoria && allowed.includes(sp.categoria as TicketCategory) ? (sp.categoria as TicketCategory) : null;
  const { page, pageSize, skip, take } = pageParams(sp);
  const where: Prisma.SupportTicketWhereInput = {
    status: sp.estado ? (sp.estado as TicketStatus) : { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] },
    ...(cat ? { category: cat } : categories ? { category: { in: categories } } : {}),
    ...(sp.q ? { OR: [{ code: { contains: sp.q.toUpperCase() } }, { subject: { contains: sp.q, mode: "insensitive" } }, { creator: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.supportTicket.findMany({ where, skip, take, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], include: { creator: { select: { name: true } }, assignedTo: { select: { name: true } } } }),
    db.supportTicket.count({ where }),
  ]);
  return (
    <>
      <PageHeader title={title} description="Por omissão mostram-se os tickets em aberto." />
      <FilterBar action={base} q={sp.q} qPlaceholder="Código, assunto ou e-mail" clearHref={base}>
        <FilterSelect name="estado" value={sp.estado} label="Em aberto" options={Object.entries(TICKET_STATUS_LABEL)} />
        <FilterSelect name="categoria" value={sp.categoria} label="Todas as categorias" options={allowed.map((c) => [c, TICKET_CATEGORY_LABEL[c]])} />
      </FilterBar>
      <DataTable rows={rows} rowKey={(r) => r.id} rowHref={(r) => `/admin/suporte/${r.id}`} empty={<EmptyState icon={LifeBuoy} title="Sem tickets" description="Não há pedidos de suporte com estes critérios." />}
        columns={[
          { key: "s", header: "Assunto", cell: (r) => r.subject },
          { key: "c", header: "Código", cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
          { key: "cat", header: "Categoria", cell: (r) => TICKET_CATEGORY_LABEL[r.category] },
          { key: "p", header: "Prioridade", cell: (r) => <Badge tone={r.priority === "URGENT" || r.priority === "HIGH" ? "red" : "neutral"}>{TICKET_PRIORITY_LABEL[r.priority]}</Badge> },
          { key: "st", header: "Estado", cell: (r) => <Badge tone={r.status === "OPEN" ? "yellow" : "blue"}>{TICKET_STATUS_LABEL[r.status]}</Badge> },
          { key: "by", header: "Cliente", cell: (r) => r.creator.name, hideOnMobile: true },
          { key: "a", header: "Responsável", cell: (r) => r.assignedTo?.name ?? "—", hideOnMobile: true },
          { key: "u", header: "Atualizado", cell: (r) => formatDate(r.updatedAt) },
        ]} />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref={base} params={{ q: sp.q, estado: sp.estado, categoria: sp.categoria }} />
    </>
  );
}
