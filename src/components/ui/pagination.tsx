import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button-class";

export function Pagination({ page, pageSize, total, baseHref, params }: { page: number; pageSize: number; total: number; baseHref: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries({ ...params, pagina: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${baseHref}?${sp.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Paginação">
      <span className="text-muted">
        Página {page} de {pages} · {total} registos
      </span>
      <div className="flex gap-2">
        {page > 1 ? <Link className={buttonClass("outline", "sm")} href={href(page - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Link> : null}
        {page < pages ? <Link className={buttonClass("outline", "sm")} href={href(page + 1)}>Seguinte <ChevronRight className="h-4 w-4" /></Link> : null}
      </div>
    </nav>
  );
}

export function pageParams(sp: { pagina?: string }, pageSize = 20) {
  const page = Math.max(1, Number(sp.pagina) || 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
