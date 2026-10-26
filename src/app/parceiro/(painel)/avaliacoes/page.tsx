import { Star } from "lucide-react";
import { requirePartner } from "@/server/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat";
import { formatDate } from "@/components/status";
import { reviewReplyAction } from "../../actions";

export const metadata = { title: "Avaliações" };

export default async function Reviews() {
  const ctx = await requirePartner("reviews.reply");
  const [r, reviews] = await Promise.all([
    db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId }, select: { ratingAvg: true, ratingCount: true } }),
    db.review.findMany({ where: { restaurantId: ctx.restaurantId }, orderBy: { createdAt: "desc" }, take: 100, include: { customer: { select: { name: true } }, order: { select: { code: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Avaliações" description="Avaliações reais de clientes com pedidos entregues." />
      <div className="mb-5 grid max-w-md grid-cols-2 gap-3"><StatCard label="Média" value={r.ratingCount ? r.ratingAvg.toFixed(1) : "—"} icon={Star} /><StatCard label="Avaliações" value={r.ratingCount} /></div>
      {reviews.length === 0 ? <EmptyState icon={Star} title="Ainda não recebeu avaliações" /> : (
        <ul className="space-y-3">
          {reviews.map((rv) => (
            <li key={rv.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{rv.customer.name.split(" ")[0]} · pedido #{rv.order.code}</p>
                <span className="flex items-center gap-0.5 text-amber-500">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < rv.rating ? "h-4 w-4 fill-current" : "h-4 w-4 text-ink/15"} />)}</span>
              </div>
              {rv.comment && <p className="mt-1">{rv.comment}</p>}
              <p className="mt-1 text-xs text-muted">{formatDate(rv.createdAt)} {rv.status === "HIDDEN" && <Badge tone="red">Oculta pela moderação</Badge>}</p>
              <ActionForm action={reviewReplyAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={rv.id} />
                <Textarea name="reply" defaultValue={rv.reply ?? ""} placeholder="Responder publicamente" className="min-h-14" maxLength={1000} aria-label="Resposta" />
                <SubmitButton size="sm" variant="outline">{rv.reply ? "Atualizar resposta" : "Responder"}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
