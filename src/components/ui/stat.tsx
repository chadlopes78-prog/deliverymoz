import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint, icon: Icon, tone = "neutral" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "neutral" | "brand" | "accent" | "warn" }) {
  const toneCls = { neutral: "bg-ink/5 text-ink/70", brand: "bg-brand/10 text-brand", accent: "bg-accent/10 text-accent", warn: "bg-amber-100 text-amber-700" }[tone];
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-medium uppercase tracking-wide text-muted sm:text-xs">{label}</p>
        {Icon && (
          <span className={cn("hidden h-8 w-8 shrink-0 place-items-center rounded-lg min-[360px]:grid", toneCls)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 break-words text-lg font-bold tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
