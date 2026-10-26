import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/tabs";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, pageParams } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/components/status";
import { ScrollText } from "lucide-react";

export const metadata = { title: "Auditoria" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ tab?: string; pagina?: string; q?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("audit.view");
  const tab = sp.tab ?? "acoes";
  const { page, pageSize, skip, take } = pageParams(sp, 50);
  return (
    <>
      <PageHeader title="Auditoria e registos" description="Ações administrativas, erros do sistema e envios de e-mail." />
      <Tabs base="/admin/auditoria" current={tab} tabs={[["acoes", "Ações"], ["erros", "Erros"], ["emails", "E-mails"], ["webhooks", "Webhooks"]]} />
      {tab === "acoes" && <Actions page={page} pageSize={pageSize} skip={skip} take={take} />}
      {tab === "erros" && <Errors skip={skip} take={take} page={page} pageSize={pageSize} />}
      {tab === "emails" && <Emails skip={skip} take={take} page={page} pageSize={pageSize} />}
      {tab === "webhooks" && <Webhooks />}
    </>
  );
}

type P = { page: number; pageSize: number; skip: number; take: number };

async function Actions({ page, pageSize, skip, take }: P) {
  const [rows, total] = await Promise.all([db.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip, take, include: { actor: { select: { name: true } } } }), db.auditLog.count()]);
  return (
    <>
      <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={ScrollText} title="Sem registos" />}
        columns={[
          { key: "d", header: "Data", cell: (r) => formatDate(r.createdAt) },
          { key: "a", header: "Utilizador", cell: (r) => r.actor?.name ?? "Sistema" },
          { key: "ac", header: "Ação", cell: (r) => <span className="font-mono text-xs">{r.action}</span> },
          { key: "e", header: "Entidade", cell: (r) => `${r.entityType}${r.entityId ? ` ${r.entityId.slice(0, 10)}…` : ""}` },
          { key: "m", header: "Detalhes", cell: (r) => <span className="line-clamp-2 max-w-xs text-xs text-muted">{r.metadata ? JSON.stringify(r.metadata) : ""}</span>, hideOnMobile: true },
        ]} />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/auditoria" params={{ tab: "acoes" }} />
    </>
  );
}

async function Errors({ page, pageSize, skip, take }: P) {
  const [rows, total] = await Promise.all([db.errorLog.findMany({ orderBy: { createdAt: "desc" }, skip, take }), db.errorLog.count()]);
  return (
    <>
      <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={ScrollText} title="Sem erros registados" />}
        columns={[
          { key: "d", header: "Data", cell: (r) => formatDate(r.createdAt) },
          { key: "s", header: "Origem", cell: (r) => <span className="font-mono text-xs">{r.source}</span> },
          { key: "m", header: "Mensagem", cell: (r) => <details><summary className="cursor-pointer text-sm">{r.message.slice(0, 120)}</summary><pre className="mt-2 max-w-xl overflow-x-auto whitespace-pre-wrap text-xs text-muted">{r.stack}</pre></details> },
        ]} />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/auditoria" params={{ tab: "erros" }} />
    </>
  );
}

async function Emails({ page, pageSize, skip, take }: P) {
  const [rows, total] = await Promise.all([db.emailLog.findMany({ orderBy: { createdAt: "desc" }, skip, take }), db.emailLog.count()]);
  return (
    <>
      <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={ScrollText} title="Sem e-mails" />}
        columns={[
          { key: "d", header: "Data", cell: (r) => formatDate(r.createdAt) },
          { key: "t", header: "Para", cell: (r) => r.to },
          { key: "s", header: "Assunto", cell: (r) => r.subject },
          { key: "st", header: "Estado", cell: (r) => <Badge tone={r.status === "SENT" ? "green" : r.status === "FAILED" ? "red" : "neutral"}>{{ SENT: "Enviado", FAILED: "Falhou", NOT_CONFIGURED: "Não configurado", DISABLED: "Desativado" }[r.status] ?? r.status}</Badge> },
        ]} />
      <Pagination page={page} pageSize={pageSize} total={total} baseHref="/admin/auditoria" params={{ tab: "emails" }} />
    </>
  );
}

async function Webhooks() {
  const rows = await db.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <DataTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState icon={ScrollText} title="Sem webhooks recebidos" />}
      columns={[
        { key: "d", header: "Data", cell: (r) => formatDate(r.createdAt) },
        { key: "p", header: "Fornecedor", cell: (r) => r.provider },
        { key: "e", header: "Evento", cell: (r) => <span className="font-mono text-xs">{r.eventId}</span> },
        { key: "s", header: "Processado", cell: (r) => r.error ? <Badge tone="red">{r.error}</Badge> : r.processedAt ? <Badge tone="green">Sim</Badge> : <Badge tone="yellow">Não</Badge> },
      ]} />
  );
}
