import Link from "next/link";
import { Search } from "lucide-react";

/** Barra de filtros por GET (funciona sem JavaScript). */
export function FilterBar({ action, children, q, qPlaceholder = "Pesquisar", clearHref }: { action: string; children?: React.ReactNode; q?: string; qPlaceholder?: string; clearHref?: string }) {
  return (
    <form action={action} className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center" role="search">
      <div className="relative min-w-0 flex-1 sm:min-w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" defaultValue={q ?? ""} type="search" placeholder={qPlaceholder} aria-label={qPlaceholder} className="h-10 w-full rounded-xl border border-line pl-9 pr-3 text-sm" />
      </div>
      {children}
      <div className="flex gap-2">
        <button className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-contrast">Filtrar</button>
        {clearHref && <Link href={clearHref} className="grid h-10 place-items-center rounded-xl px-3 text-sm font-semibold text-muted hover:bg-ink/5">Limpar</Link>}
      </div>
    </form>
  );
}

export function FilterSelect({ name, value, options, label }: { name: string; value?: string; options: [string, string][]; label: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm">
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
