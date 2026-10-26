import Link from "next/link";
import { cn } from "@/lib/utils";

export function Tabs({ tabs, current, base }: { tabs: [string, string][]; current: string; base: string }) {
  return (
    <nav className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Separadores">
      {tabs.map(([key, label]) => (
        <Link key={key} href={`${base}?tab=${key}`} aria-current={current === key ? "page" : undefined} className={cn("shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold", current === key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
