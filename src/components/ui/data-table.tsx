import Link from "next/link";
import { cn } from "@/lib/utils";

export type Column<T> = { key: string; header: string; cell: (row: T) => React.ReactNode; className?: string; hideOnMobile?: boolean; primary?: boolean };

/**
 * Tabela adaptativa: tabela clássica em ecrãs médios/grandes e lista de cartões em telemóveis.
 */
export function DataTable<T>({ rows, columns, rowKey, rowHref, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; rowHref?: (r: T) => string; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink/[0.03] text-xs uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-ink/[0.02]">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                    {rowHref && i === 0 ? (
                      <Link href={rowHref(r)} className="font-medium text-ink hover:text-brand">
                        {c.cell(r)}
                      </Link>
                    ) : (
                      c.cell(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2.5 md:hidden">
        {rows.map((r) => {
          const inner = (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c, i) =>
                  i === 0 ? (
                    <div key={c.key} className="mb-2 font-semibold">{c.cell(r)}</div>
                  ) : (
                    <div key={c.key} className="flex items-start justify-between gap-3 py-0.5 text-sm">
                      <span className="shrink-0 text-muted">{c.header}</span>
                      <span className="min-w-0 text-right">{c.cell(r)}</span>
                    </div>
                  ),
                )}
            </div>
          );
          return <li key={rowKey(r)}>{rowHref ? <Link href={rowHref(r)} className="block active:opacity-80">{inner}</Link> : inner}</li>;
        })}
      </ul>
    </>
  );
}
