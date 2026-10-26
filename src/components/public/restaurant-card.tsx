import Link from "next/link";
import { Star, Clock, Bike, Tag } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { fileUrl } from "@/server/storage/files";
import type { RestaurantListItem } from "@/server/services/catalog";
import { cn } from "@/lib/utils";

export function RestaurantCard({ r, currency, layout = "row" }: { r: RestaurantListItem; currency: string; layout?: "row" | "tile" }) {
  const closed = !r.availability.orderable;
  const fee = r.deliveryFeeCents == null ? null : r.deliveryFeeCents === 0 ? "Entrega grátis" : `${r.feeIsFrom ? "desde " : ""}${formatMoney(r.deliveryFeeCents, currency)}`;
  const meta = (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {r.ratingCount > 0 ? (
        <span className="flex items-center gap-1 font-semibold text-amber-600"><Star className="h-3.5 w-3.5 fill-current" aria-hidden />{r.ratingAvg.toFixed(1)} <span className="font-normal text-muted">({r.ratingCount})</span></span>
      ) : (
        <span>Novo</span>
      )}
      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{r.etaMinutes}-{r.etaMinutes + 10} min</span>
      {fee && <span className="flex items-center gap-1"><Bike className="h-3.5 w-3.5" aria-hidden />{fee}</span>}
    </div>
  );
  if (layout === "tile") {
    return (
      <Link href={`/restaurante/${r.slug}`} className="group block w-64 shrink-0 sm:w-72">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-ink/5">
          {r.coverFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(r.coverFileId)!} alt="" loading="lazy" decoding="async" className={cn("h-full w-full object-cover transition duration-300 group-hover:scale-105", closed && "grayscale")} />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand/20 to-accent/20" />
          )}
          {r.hasPromo && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-contrast"><Tag className="h-3 w-3" />Promoção</span>}
          {closed && <span className="absolute right-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">{r.availability.label}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Thumb id={r.logoFileId} name={r.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold group-hover:text-brand">{r.name}</p>
            {meta}
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link href={`/restaurante/${r.slug}`} className={cn("group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface hover:shadow-sm", closed && "opacity-70")}>
      <Thumb id={r.logoFileId} name={r.name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold group-hover:text-brand">{r.name}</p>
          {r.hasPromo && <Tag className="h-3.5 w-3.5 shrink-0 text-brand" aria-label="Promoção" />}
        </div>
        <p className="truncate text-xs text-muted">{r.cuisines.map((c) => c.name).join(" · ") || r.description || ""}</p>
        {meta}
        {closed && <p className="mt-1 text-xs font-semibold text-ink/70">{r.availability.label}</p>}
      </div>
    </Link>
  );
}

export function Thumb({ id, name, size = "md" }: { id: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const cls = { sm: "h-9 w-9 rounded-xl text-sm", md: "h-12 w-12 rounded-xl", lg: "h-16 w-16 rounded-2xl text-lg" }[size];
  return id ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={fileUrl(id)!} alt="" loading="lazy" decoding="async" className={cn(cls, "shrink-0 border border-line object-cover")} />
  ) : (
    <span className={cn(cls, "grid shrink-0 place-items-center bg-brand/10 font-bold text-brand")} aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
  );
}
