import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { RESTAURANT_ROLE_LABEL } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickAction } from "@/components/reason-form";
import { memberAction, memberUpdateAction } from "../../actions";

export const metadata = { title: "Funcionários" };

export default async function Members() {
  const ctx = await requirePartner("staff.manage");
  const members = await db.restaurantMember.findMany({ where: { restaurantId: ctx.restaurantId }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader title="Funcionários" description="Proprietário: acesso total. Gerente: tudo exceto funcionários e dados de liquidação. Operador: apenas pedidos." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{m.user.name} {m.userId === ctx.user.id && <span className="text-muted">(você)</span>}</p><p className="text-muted">{m.user.email}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">{RESTAURANT_ROLE_LABEL[m.role]}</Badge>
                {!m.isActive && <Badge>Inativo</Badge>}
                {m.userId !== ctx.user.id && (
                  <>
                    <ActionForm action={memberUpdateAction} className="flex gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <Select name="role" defaultValue={m.role} className="h-9 w-40" aria-label="Função">{Object.entries(RESTAURANT_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                      <SubmitButton size="sm" variant="outline">OK</SubmitButton>
                    </ActionForm>
                    <QuickAction action={memberUpdateAction} hidden={{ id: m.id, isActive: m.isActive ? "false" : "true" }} label={m.isActive ? "Desativar" : "Ativar"} />
                    <QuickAction action={memberUpdateAction} hidden={{ id: m.id, remove: "true" }} label="Remover" variant="ghost" confirmMessage="Remover este funcionário do restaurante?" />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Card>
          <CardHeader title="Adicionar funcionário" description="Se o e-mail já tiver conta, basta o e-mail e a função." />
          <CardBody>
            <ActionForm action={memberAction} resetOnSuccess className="space-y-3">
              <Field label="E-mail" htmlFor="memail"><Input id="memail" name="email" type="email" required /></Field>
              <Field label="Função" htmlFor="mrole"><Select id="mrole" name="role" defaultValue="ORDER_OPERATOR">{Object.entries(RESTAURANT_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <p className="pt-1 text-xs font-semibold uppercase text-muted">Nova conta (opcional)</p>
              <Field label="Nome" htmlFor="mname"><Input id="mname" name="name" /></Field>
              <Field label="Telefone" htmlFor="mphone"><Input id="mphone" name="phone" type="tel" /></Field>
              <Field label="Palavra-passe inicial" htmlFor="mpw"><Input id="mpw" name="password" type="password" autoComplete="new-password" /></Field>
              <SubmitButton className="w-full">Adicionar</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
