import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/server/guards";
import { db } from "@/server/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/components/status";
import { emailConfigured } from "@/server/email";
import { prefsAction, readNotificationsAction } from "../actions";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const user = await requireUser("/minha-conta/notificacoes");
  const [items, prefs] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notifyEmailOrders: true, notifyEmailMarketing: true, notifyInApp: true } }),
  ]);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Notificações" action={unread > 0 ? <ActionForm action={readNotificationsAction} hideMessage><SubmitButton size="sm" variant="outline">Marcar todas como lidas</SubmitButton></ActionForm> : null} />
        <CardBody className="p-0 sm:p-0">
          {items.length === 0 ? <div className="p-4"><EmptyState icon={Bell} title="Sem notificações" className="border-0" /></div> : (
            <ul className="divide-y divide-line">
              {items.map((n) => {
                const content = (
                  <div className={cn("px-4 py-3 sm:px-5", !n.readAt && "bg-brand/5")}>
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-sm text-muted">{n.body}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDate(n.createdAt)}</p>
                  </div>
                );
                return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-ink/[0.02]">{content}</Link> : content}</li>;
              })}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Preferências" description={emailConfigured() ? undefined : "O envio de e-mails ainda não está ativo na plataforma; as preferências serão aplicadas quando for configurado."} />
        <CardBody>
          <ActionForm action={prefsAction} className="space-y-3">
            <Checkbox name="notifyInApp" defaultChecked={prefs.notifyInApp} label="Notificações dentro do site" />
            <Checkbox name="notifyEmailOrders" defaultChecked={prefs.notifyEmailOrders} label="E-mails sobre os meus pedidos" />
            <Checkbox name="notifyEmailMarketing" defaultChecked={prefs.notifyEmailMarketing} label="E-mails com promoções e novidades" />
            <SubmitButton>Guardar preferências</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
