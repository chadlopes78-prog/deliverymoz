import { requireUser } from "@/server/guards";
import { db } from "@/server/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { formatDate } from "@/components/status";
import { passwordAction, logoutOthersAction, closeAccountAction } from "../actions";

export default async function SecurityPage() {
  const user = await requireUser("/minha-conta/seguranca");
  const sessions = await db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 10 });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Alterar palavra-passe" />
        <CardBody>
          <ActionForm action={passwordAction} resetOnSuccess className="grid gap-4 sm:grid-cols-3">
            <Field label="Atual" htmlFor="current"><Input id="current" name="current" type="password" required autoComplete="current-password" /></Field>
            <Field label="Nova" htmlFor="next"><Input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" /></Field>
            <Field label="Confirmar" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></Field>
            <div className="sm:col-span-3"><SubmitButton>Alterar</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Sessões ativas" action={<ActionForm action={logoutOthersAction} hideMessage><SubmitButton size="sm" variant="outline">Terminar outras sessões</SubmitButton></ActionForm>} />
        <CardBody>
          <ul className="space-y-2 text-sm">
            {sessions.map((s) => <li key={s.id} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between"><span className="truncate">{s.userAgent ?? "Dispositivo desconhecido"}</span><span className="text-muted">{formatDate(s.lastSeenAt)}</span></li>)}
          </ul>
        </CardBody>
      </Card>
      <Card className="border-red-200">
        <CardHeader title="Encerrar conta" description="Os seus dados pessoais serão anonimizados. Os registos de pedidos são mantidos por obrigações legais." />
        <CardBody>
          <ActionForm action={closeAccountAction} confirmMessage="Esta ação é irreversível. Continuar?" className="grid gap-4 sm:grid-cols-2">
            <Field label="Palavra-passe" htmlFor="close-pw"><Input id="close-pw" name="password" type="password" required autoComplete="current-password" /></Field>
            <Field label='Escreva "ENCERRAR"' htmlFor="close-confirm"><Input id="close-confirm" name="confirm" required /></Field>
            <div className="sm:col-span-2"><SubmitButton variant="danger">Encerrar a minha conta</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
