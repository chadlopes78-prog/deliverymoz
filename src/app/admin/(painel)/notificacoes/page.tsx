import Link from "next/link";
import { Bell } from "lucide-react";
import { requireAdmin } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { QuickAction } from "@/components/reason-form";
import { formatDate } from "@/components/status";
import { cn } from "@/lib/utils";
import { adminMarkNotificationsReadAction } from "@/app/admin/actions";

export const metadata = { title: "Notificações" };

/** Notificações desta conta (novas candidaturas, reembolsos, entregas sem entregador…), geradas pelo servidor. */
export default async function AdminNotifications() {
  const user = await requireAdmin("dashboard.view");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notificações" description={unread ? `${unread} por ler.` : "Está tudo lido."} actions={unread ? <QuickAction action={adminMarkNotificationsReadAction} hidden={{}} label="Marcar todas como lidas" /> : null} />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Ainda não tem notificações" description="Aqui aparecem, por exemplo, novas candidaturas de restaurantes, reembolsos pendentes e entregas sem entregador." />
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {items.map((n) => {
            const body = (
              <>
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block text-sm text-muted">{n.body}</span>
                </span>
                <time className="shrink-0 text-xs text-muted" dateTime={n.createdAt.toISOString()}>{formatDate(n.createdAt)}</time>
              </>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="flex gap-3 p-4 hover:bg-ink/[0.02]">{body}</Link> : <div className="flex gap-3 p-4">{body}</div>}</li>;
          })}
        </ul>
      )}
    </>
  );
}
