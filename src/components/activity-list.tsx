import Link from "next/link";
import { Activity, Receipt, Store, Package, UserRound, ShieldCheck } from "lucide-react";
import type { ActivityItem, ActivityKind } from "@/server/services/activity";
import { formatDate } from "@/components/status";
import { cn } from "@/lib/utils";

const ICON = { pedidos: Receipt, restaurantes: Store, produtos: Package, contas: UserRound, administracao: ShieldCheck } satisfies Record<ActivityKind, typeof Activity>;
const TONE: Record<ActivityKind, string> = {
  pedidos: "bg-brand/10 text-brand",
  restaurantes: "bg-accent/10 text-accent",
  produtos: "bg-amber-100 text-amber-700",
  contas: "bg-sky-100 text-sky-700",
  administracao: "bg-ink/5 text-ink/70",
};

/** Linha temporal de eventos reais (data, hora, tipo e autor quando conhecido). */
export function ActivityList({ items, empty = "Ainda não existe atividade registada." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
        <Activity className="h-6 w-6" aria-hidden />
        {empty}
      </div>
    );
  }
  return (
    <ol className="divide-y divide-line">
      {items.map((i) => {
        const Icon = ICON[i.kind];
        const body = (
          <>
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", TONE[i.kind])}><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{i.title}</span>
              {(i.detail || i.actor) && <span className="block truncate text-xs text-muted">{[i.detail, i.actor ? `por ${i.actor}` : null].filter(Boolean).join(" · ")}</span>}
            </span>
            <time dateTime={i.at.toISOString()} className="shrink-0 text-xs tabular-nums text-muted">{formatDate(i.at)}</time>
          </>
        );
        return (
          <li key={i.id}>
            {i.href ? <Link href={i.href} className="flex items-center gap-3 py-2.5 hover:text-brand">{body}</Link> : <div className="flex items-center gap-3 py-2.5">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}
