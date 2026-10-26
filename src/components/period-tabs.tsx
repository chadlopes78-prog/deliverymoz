import Link from "next/link";
import { cn } from "@/lib/utils";

const PERIODS = [["7d", "7 dias"], ["30d", "30 dias"], ["90d", "90 dias"], ["365d", "12 meses"]] as const;

export function PeriodTabs({ current, base, extra }: { current: string; base: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Período">
        {PERIODS.map(([k, label]) => (
          <Link key={k} href={`${base}?periodo=${k}`} role="tab" aria-selected={current === k} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", current === k ? "bg-brand text-brand-contrast" : "text-muted hover:text-ink")}>{label}</Link>
        ))}
      </div>
      <form className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1 text-sm sm:flex sm:w-auto" action={base}>
        <input type="date" name="de" aria-label="De" className="h-9 min-w-0 rounded-lg border border-line bg-surface px-2" />
        <span className="text-muted">a</span>
        <input type="date" name="ate" aria-label="Até" className="h-9 min-w-0 rounded-lg border border-line bg-surface px-2" />
        <button className="h-9 rounded-lg border border-line bg-surface px-3 font-semibold">OK</button>
      </form>
      {extra}
    </div>
  );
}
