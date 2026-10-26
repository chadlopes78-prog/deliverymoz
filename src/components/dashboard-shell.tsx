"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu, X, LogOut, LayoutDashboard, Store, Users, Bike, Receipt, Truck, Wallet, Percent, Megaphone, Ticket, LifeBuoy, UserCog,
  Settings, ScrollText, UtensilsCrossed, FolderTree, Clock, MapPin, Star, Tag, History, User, FileText, Home, type LucideIcon,
} from "lucide-react";

const ICONS = {
  LayoutDashboard, Store, Users, Bike, Receipt, Truck, Wallet, Percent, Megaphone, Ticket, LifeBuoy, UserCog,
  Settings, ScrollText, UtensilsCrossed, FolderTree, Clock, MapPin, Star, Tag, History, User, FileText, Home,
} satisfies Record<string, LucideIcon>;
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };

/** Estrutura dos painéis: barra lateral fixa no computador e gaveta no telemóvel. */
export function DashboardShell({ brand, title, subtitle, nav, children, logoutAction, topRight, bottomNav }: { brand: React.ReactNode; title: string; subtitle?: string; nav: NavItem[]; children: React.ReactNode; logoutAction: () => Promise<void>; topRight?: React.ReactNode; bottomNav?: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const isActive = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const links = (
    <ul className="space-y-0.5">
      {nav.map((i) => {
        const Icon = ICONS[i.icon];
        const active = isActive(i);
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active ? "bg-brand text-brand-contrast" : "text-ink/75 hover:bg-ink/5 hover:text-ink")}>
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1 truncate">{i.label}</span>
              {i.badge ? <span className={cn("rounded-full px-1.5 text-xs font-bold", active ? "bg-white/25" : "bg-brand text-brand-contrast")}>{i.badge}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <div className="border-b border-line px-4 py-4">{brand}<p className="mt-2 truncate text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>{subtitle && <p className="truncate text-sm font-semibold">{subtitle}</p>}</div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label={title}>{links}</nav>
        <form action={logoutAction} className="border-t border-line p-3"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut className="h-[18px] w-[18px]" /> Terminar sessão</button></form>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur pt-safe lg:hidden">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Abrir menu" aria-expanded={open}><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{subtitle ?? title}</p></div>
          {topRight}
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} aria-label="Fechar menu" />
            <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-surface shadow-xl animate-slide-up pt-safe">
              <div className="flex items-start justify-between border-b border-line px-4 py-4">
                <div className="min-w-0">{brand}<p className="mt-2 truncate text-sm font-semibold">{subtitle ?? title}</p></div>
                <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" aria-label="Fechar"><X className="h-5 w-5" /></button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3">{links}</nav>
              <form action={logoutAction} className="border-t border-line p-3 pb-safe"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600"><LogOut className="h-[18px] w-[18px]" /> Terminar sessão</button></form>
            </div>
          </div>
        )}
        <main className={cn("mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7", bottomNav && "pb-24 lg:pb-7")}>{children}</main>
        {bottomNav && (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe lg:hidden" aria-label="Navegação rápida">
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}>
              {bottomNav.map((i) => {
                const Icon = ICONS[i.icon];
                const active = isActive(i);
                return (
                  <li key={i.href}>
                    <Link href={i.href} className={cn("relative flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-medium", active ? "text-brand" : "text-muted")}>
                      <Icon className="h-5 w-5" aria-hidden />{i.label}
                      {i.badge ? <span className="absolute top-1 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-contrast">{i.badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
