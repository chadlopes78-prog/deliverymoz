import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { ADMIN_PERMISSION_LABEL, DELEGABLE_PERMISSIONS, PRIVILEGED, STAFF_ROLE_LABEL, STAFF_ROLE_PERMISSIONS, staffPermissions } from "@/server/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { formatDate } from "@/components/status";
import { staffAction, staffActiveAction } from "@/app/admin/actions";

export const metadata = { title: "Administradores e permissões" };

const HISTORY_LABEL: Record<string, string> = { "staff.upsert": "Permissões definidas", "staff.activate": "Acesso reativado", "staff.deactivate": "Acesso retirado" };

export default async function Administrators() {
  await requireAdmin("staff.manage");
  const [owners, staff, history] = await Promise.all([
    db.user.findMany({ where: { isSuperAdmin: true }, select: { id: true, name: true, email: true, lastLoginAt: true } }),
    db.staffMember.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, status: true } } } }),
    db.auditLog.findMany({ where: { action: { in: Object.keys(HISTORY_LABEL) } }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } }),
  ]);
  const names = new Map(staff.map((s) => [s.user.id, s.user.name]));
  return (
    <>
      <PageHeader title="Administradores e permissões" description="Promova contas existentes a administradores secundários e defina o que cada um pode fazer. Configurações, administradores, comissões e auditoria são exclusivos do Super Admin." />
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Super Admin" description="Controlo total. Não pode ser rebaixado, suspenso ou bloqueado por outros administradores." />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {owners.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2"><span><strong>{o.name}</strong> <span className="text-muted">{o.email}</span></span><Badge tone="brand">Todas as permissões</Badge></li>)}
              </ul>
            </CardBody>
          </Card>
          {staff.length === 0 ? <EmptyState icon={ShieldCheck} title="Ainda não existem administradores secundários" description="Use o formulário para dar acesso administrativo a uma conta." /> : (
            <ul className="space-y-3">
              {staff.map((s) => {
                const perms = staffPermissions(s);
                return (
                  <li key={s.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/admin/utilizadores/${s.user.id}`} className="font-semibold hover:text-brand">{s.user.name}</Link>
                        <p className="truncate text-muted">{s.user.email} · último acesso {formatDate(s.user.lastLoginAt)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="blue">{s.permissions.length ? "Personalizado" : STAFF_ROLE_LABEL[s.role]}</Badge>
                        <Badge tone={s.isActive ? "green" : "neutral"}>{s.isActive ? "Ativo" : "Sem acesso"}</Badge>
                        <QuickAction action={staffActiveAction} hidden={{ id: s.id, isActive: s.isActive ? "false" : "true" }} label={s.isActive ? "Retirar acesso" : "Reativar"} variant={s.isActive ? "outline" : "accent"} confirmMessage={s.isActive ? "Retirar o acesso administrativo? As sessões desta conta são terminadas." : undefined} />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted">{perms.map((p) => ADMIN_PERMISSION_LABEL[p]).join(" · ")}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <Card>
            <CardHeader title="Histórico de alterações" />
            <CardBody>
              {history.length === 0 ? <p className="text-sm text-muted">Sem alterações registadas.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span><strong>{HISTORY_LABEL[h.action]}</strong>{h.entityId && names.get(h.entityId) ? ` · ${names.get(h.entityId)}` : ""}</span>
                      <span className="text-muted">{h.actor?.name ?? "Sistema"} · {formatDate(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Promover ou alterar administrador" description="Com uma conta existente basta o e-mail. Escolha uma função-base e, se quiser, marque permissões específicas (substituem as da função)." />
          <CardBody>
            <ActionForm action={staffAction} resetOnSuccess className="space-y-3">
              <Field label="E-mail da conta" htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
              <Field label="Função-base" htmlFor="role"><Select id="role" name="role">{Object.entries(STAFF_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <fieldset className="rounded-xl border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Permissões personalizadas (opcional)</legend>
                <div className="grid gap-2">
                  {DELEGABLE_PERMISSIONS.map((p) => <Checkbox key={p} name="permissions" value={p} label={ADMIN_PERMISSION_LABEL[p]} />)}
                </div>
                <p className="mt-2 text-xs text-muted">Exclusivas do Super Admin: {PRIVILEGED.map((p) => ADMIN_PERMISSION_LABEL[p]).join(", ")}.</p>
              </fieldset>
              <details className="rounded-xl border border-line p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Criar conta nova (se o e-mail não existir)</summary>
                <div className="mt-3 space-y-3">
                  <Field label="Nome" htmlFor="name"><Input id="name" name="name" /></Field>
                  <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" type="tel" /></Field>
                  <Field label="Palavra-passe inicial" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
                </div>
              </details>
              <SubmitButton className="w-full">Guardar administrador</SubmitButton>
            </ActionForm>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-semibold text-brand">Permissões de cada função-base</summary>
              <div className="mt-2 space-y-2">
                {Object.entries(STAFF_ROLE_PERMISSIONS).map(([role, perms]) => <div key={role}><p className="font-semibold">{STAFF_ROLE_LABEL[role as keyof typeof STAFF_ROLE_LABEL]}</p><p className="text-xs text-muted">{perms.map((p) => ADMIN_PERMISSION_LABEL[p]).join(" · ")}</p></div>)}
              </div>
            </details>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
