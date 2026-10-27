import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Select, Textarea, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OrderStatusBadge, formatDate } from "@/components/status";
import { TICKET_CATEGORY_LABEL, TICKET_PRIORITY_LABEL, TICKET_STATUS_LABEL } from "@/server/services/support";
import { formatPhone, cn } from "@/lib/utils";
import { ticketReplyAction } from "@/app/admin/actions";

export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin("support.manage");
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true, phone: true } }, assignedTo: { select: { name: true } },
      order: { select: { id: true, code: true, status: true, totalCents: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
    },
  });
  if (!t) notFound();
  return (
    <>
      <Link href="/admin/suporte" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Suporte</Link>
      <PageHeader title={t.subject} description={`${t.code} · ${TICKET_CATEGORY_LABEL[t.category]} · aberto ${formatDate(t.createdAt)}`} actions={<><Badge>{TICKET_PRIORITY_LABEL[t.priority]}</Badge><Badge tone="yellow">{TICKET_STATUS_LABEL[t.status]}</Badge></>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <ol className="space-y-3">
            {t.messages.map((m) => (
              <li key={m.id} className={cn("rounded-2xl p-3 text-sm", m.isInternal ? "border border-dashed border-amber-300 bg-amber-50" : m.author.id === t.creator.id ? "bg-surface ring-1 ring-line" : "bg-brand/5")}>
                <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">{m.isInternal && <Lock className="h-3 w-3" />}{m.author.name} · {formatDate(m.createdAt)}{m.isInternal ? " · nota interna" : ""}</p>
                <p className="whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ol>
          <ActionForm action={ticketReplyAction} resetOnSuccess className="mt-5 space-y-3 rounded-2xl border border-line bg-surface p-4">
            <input type="hidden" name="id" value={t.id} />
            <Textarea name="body" placeholder="Resposta ao cliente ou nota interna" aria-label="Mensagem" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Estado" htmlFor="status"><Select id="status" name="status" defaultValue="">{[["", "Manter / automático"], ...Object.entries(TICKET_STATUS_LABEL)].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Prioridade" htmlFor="priority"><Select id="priority" name="priority" defaultValue={t.priority}>{Object.entries(TICKET_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            </div>
            <div className="flex flex-wrap gap-4"><Checkbox name="isInternal" label="Nota interna (não visível ao cliente)" />{t.assignedTo?.name !== admin.name && <Checkbox name="assignToMe" label="Atribuir a mim" />}</div>
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Cliente" /><CardBody className="space-y-1 text-sm"><Link href={`/admin/utilizadores/${t.creator.id}`} className="font-semibold text-brand">{t.creator.name}</Link><p>{t.creator.email}</p><p>{formatPhone(t.creator.phone)}</p></CardBody></Card>
          {t.order && <Card><CardHeader title="Pedido" /><CardBody className="space-y-1 text-sm"><Link href={`/admin/pedidos/${t.order.id}`} className="font-mono font-semibold text-brand">#{t.order.code}</Link><OrderStatusBadge status={t.order.status} /></CardBody></Card>}
          <Card><CardBody className="text-sm text-muted">Responsável: {t.assignedTo?.name ?? "ninguém"}</CardBody></Card>
        </div>
      </div>
    </>
  );
}
