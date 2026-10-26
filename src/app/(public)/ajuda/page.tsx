import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy, Mail, Phone, MessageCircle } from "lucide-react";
import { getSettings } from "@/server/services/settings";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-class";
import { Badge } from "@/components/ui/badge";
import { createTicketAction } from "../actions";
import { TICKET_CATEGORY_LABEL, TICKET_STATUS_LABEL } from "@/server/services/support";
import { formatDate } from "@/components/status";

export const metadata: Metadata = { title: "Ajuda" };

const FAQ = [
  ["Como faço um pedido?", "Escolha a sua localização, abra um restaurante, adicione produtos à sacola e finalize no checkout."],
  ["Posso cancelar um pedido?", "Sim, enquanto o restaurante ainda não o tiver aceitado. Depois disso, contacte o suporte."],
  ["Quando é cobrado um pagamento por M-Pesa?", "Receberá um pedido de confirmação no telemóvel. O pedido só segue para o restaurante quando o pagamento é confirmado."],
  ["Como peço um reembolso?", "Abra um pedido de suporte com a categoria Reembolso e indique o código do pedido."],
];

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { pedido } = await searchParams;
  const [settings, user] = await Promise.all([getSettings(), getSessionUser()]);
  const tickets = user ? await db.supportTicket.findMany({ where: { creatorId: user.id }, orderBy: { updatedAt: "desc" }, take: 20 }) : [];
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><LifeBuoy className="h-6 w-6 text-brand" /> Central de ajuda</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {settings.supportEmail && <a href={`mailto:${settings.supportEmail}`} className={buttonClass("outline", "sm")}><Mail className="h-4 w-4" />{settings.supportEmail}</a>}
        {settings.supportPhone && <a href={`tel:${settings.supportPhone.replace(/\s/g, "")}`} className={buttonClass("outline", "sm")}><Phone className="h-4 w-4" />{settings.supportPhone}</a>}
        {settings.whatsapp && <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm")}><MessageCircle className="h-4 w-4" />WhatsApp</a>}
      </div>
      <section className="mt-6 space-y-2">
        {FAQ.map(([q, a]) => (
          <details key={q} className="rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer font-semibold">{q}</summary>
            <p className="mt-2 text-sm text-muted">{a}</p>
          </details>
        ))}
      </section>
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-bold">Abrir pedido de suporte</h2>
          {user ? (
            <ActionForm action={createTicketAction} className="mt-4 space-y-4">
              <Field label="Categoria" htmlFor="category">
                <Select id="category" name="category" defaultValue={pedido ? "ORDER" : "OTHER"}>
                  {Object.entries(TICKET_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Código do pedido (opcional)" htmlFor="orderCode"><Input id="orderCode" name="orderCode" defaultValue={pedido ?? ""} className="uppercase" /></Field>
              <Field label="Assunto" htmlFor="subject"><Input id="subject" name="subject" required minLength={3} maxLength={150} /></Field>
              <Field label="Mensagem" htmlFor="message"><Textarea id="message" name="message" required minLength={5} maxLength={4000} /></Field>
              <SubmitButton className="w-full">Enviar</SubmitButton>
            </ActionForm>
          ) : (
            <p className="mt-3 text-sm text-muted"><Link href="/entrar?next=/ajuda" className="font-semibold text-brand">Entre na sua conta</Link> para abrir um pedido de suporte.</p>
          )}
        </div>
        {user && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-bold">Os meus pedidos de suporte</h2>
            {tickets.length === 0 ? <p className="mt-3 text-sm text-muted">Ainda não abriu nenhum pedido de suporte.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/ajuda/tickets/${t.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-brand">
                      <span className="min-w-0"><span className="block truncate font-semibold">{t.subject}</span><span className="text-xs text-muted">{t.code} · {formatDate(t.updatedAt)}</span></span>
                      <Badge tone={t.status === "RESOLVED" || t.status === "CLOSED" ? "green" : "yellow"}>{TICKET_STATUS_LABEL[t.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
