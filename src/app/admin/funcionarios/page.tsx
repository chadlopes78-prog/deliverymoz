import { UserCog } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { STAFF_ROLE_LABEL, STAFF_ROLE_PERMISSIONS } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { formatDate } from "@/components/status";
import { staffAction, staffActiveAction } from "../actions";

export const metadata = { title: "Funcionários" };

export default async function Staff() {
  await requireAdmin("staff.manage");
  const staff = await db.staffMember.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true, lastLoginAt: true } } } });
  return (
    <>
      <PageHeader title="Funcionários" description="Funcionários têm permissões limitadas. Configurações, comissões, funcionários e auditoria são exclusivos do Super Admin." />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div>
          {staff.length === 0 ? <EmptyState icon={UserCog} title="Ainda não existem funcionários" /> : (
            <ul className="space-y-2">
              {staff.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
                  <div><p className="font-semibold">{s.user.name}</p><p className="text-muted">{s.user.email} · último acesso {formatDate(s.user.lastLoginAt)}</p></div>
                  <div className="flex items-center gap-2"><Badge tone="blue">{STAFF_ROLE_LABEL[s.role]}</Badge><Badge tone={s.isActive ? "green" : "neutral"}>{s.isActive ? "Ativo" : "Inativo"}</Badge><QuickAction action={staffActiveAction} hidden={{ id: s.id, isActive: s.isActive ? "false" : "true" }} label={s.isActive ? "Desativar" : "Ativar"} /></div>
                </li>
              ))}
            </ul>
          )}
          <Card className="mt-5">
            <CardHeader title="Permissões por função" />
            <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
              {Object.entries(STAFF_ROLE_PERMISSIONS).map(([role, perms]) => <div key={role}><p className="font-semibold">{STAFF_ROLE_LABEL[role as keyof typeof STAFF_ROLE_LABEL]}</p><p className="text-xs text-muted">{perms.join(", ")}</p></div>)}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Adicionar ou alterar funcionário" description="Se o e-mail já tiver conta, basta o e-mail e a função." />
          <CardBody>
            <ActionForm action={staffAction} resetOnSuccess className="space-y-3">
              <Field label="E-mail" htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
              <Field label="Função" htmlFor="role"><Select id="role" name="role">{Object.entries(STAFF_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <p className="pt-2 text-xs font-semibold uppercase text-muted">Nova conta (opcional)</p>
              <Field label="Nome" htmlFor="name"><Input id="name" name="name" /></Field>
              <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" /></Field>
              <Field label="Palavra-passe inicial" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
              <SubmitButton className="w-full">Guardar</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
