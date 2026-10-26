import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getTicketForUser, TICKET_STATUS_LABEL, TICKET_CATEGORY_LABEL } from "@/server/services/support";
import { ActionForm } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/components/status";
import { replyTicketAction } from "../../../actions";
import { cn } from "@/lib/utils";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/ajuda/tickets/${id}`);
  const t = await getTicketForUser(user.id, id);
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/ajuda" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Ajuda</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t.subject}</h1>
          <p className="text-sm text-muted">{t.code} · {TICKET_CATEGORY_LABEL[t.category]}{t.order ? ` · Pedido #${t.order.code}` : ""}</p>
        </div>
        <Badge tone={t.status === "RESOLVED" || t.status === "CLOSED" ? "green" : "yellow"}>{TICKET_STATUS_LABEL[t.status]}</Badge>
      </div>
      <ol className="mt-6 space-y-3">
        {t.messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-2xl p-3 text-sm", m.author.id === user.id ? "ml-auto bg-brand/10" : "bg-surface ring-1 ring-line")}>
            <p className="whitespace-pre-line">{m.body}</p>
            <p className="mt-1 text-xs text-muted">{m.author.id === user.id ? "Você" : "Suporte"} · {formatDate(m.createdAt)}</p>
          </li>
        ))}
      </ol>
      {t.status !== "CLOSED" && (
        <ActionForm action={replyTicketAction} resetOnSuccess className="mt-6">
          <input type="hidden" name="ticketId" value={t.id} />
          <Textarea name="body" required maxLength={4000} placeholder="Escreva a sua mensagem" aria-label="Mensagem" />
          <SubmitButton className="mt-2">Enviar mensagem</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
