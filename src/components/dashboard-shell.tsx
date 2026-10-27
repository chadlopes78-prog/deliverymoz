"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu, X, LogOut, LayoutDashboard, Store, Users, Bike, Receipt, Truck, Wallet, Percent, Megaphone, Ticket, LifeBuoy, UserCog,
  Settings, ScrollText, UtensilsCrossed, FolderTree, Clock, MapPin, Star, Tag, History, User, FileText, Home, Package, BarChart3,
  ArrowLeftRight, Image, ShieldCheck, BadgeCheck, MessageSquareWarning, CircleHelp, ShoppingBag, Handshake, Activity, ExternalLink, type LucideIcon,
} from "lucide-react";

const ICONS = {
  LayoutDashboard, Store, Users, Bike, Receipt, Truck, Wallet, Percent, Megaphone, Ticket, LifeBuoy, UserCog,
  Settings, ScrollText, UtensilsCrossed, FolderTree, Clock, MapPin, Star, Tag, History, User, FileText, Home, Package, BarChart3,
  ArrowLeftRight, Image, ShieldCheck, BadgeCheck, MessageSquareWarning, CircleHelp, ShoppingBag, Handshake, Activity,
} satisfies Record<string, LucideIcon>;
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean; section?: string };

type Variant = "admin" | "partner" | "courier";

/** Cores por área: o centro de controlo usa uma barra escura, distinta dos painéis de restaurante e entregador. */
const THEME: Record<Variant, { aside: string; muted: string; idle: string; active: string; border: string; header: string; badgeIdle: string; danger: string }> = {
  admin: {
    aside: "bg-[#12141a] text-white",
    muted: "text-white/45",
    idle: "text-white/75 hover:bg-white/10 hover:text-white",
    active: "bg-brand text-brand-contrast shadow-sm",
    border: "border-white/10",
    header: "bg-[#12141a] text-white",
    badgeIdle: "bg-brand text-brand-contrast",
    danger: "text-red-300 hover:bg-white/10",
  },
  partner: {
    aside: "bg-surface text-ink",
    muted: "text-muted",
    idle: "text-ink/75 hover:bg-ink/5 hover:text-ink",
    active: "bg-accent text-white shadow-sm",
    border: "border-line",
    header: "bg-surface/95 text-ink backdrop-blur",
    badgeIdle: "bg-brand text-brand-contrast",
    danger: "text-red-600 hover:bg-red-50",
  },
  courier: {
    aside: "bg-surface text-ink",
    muted: "text-muted",
    idle: "text-ink/75 hover:bg-ink/5 hover:text-ink",
    active: "bg-brand text-brand-contrast shadow-sm",
    border: "border-line",
    header: "bg-surface/95 text-ink backdrop-blur",
    badgeIdle: "bg-brand text-brand-contrast",
    danger: "text-red-600 hover:bg-red-50",
  },
};

/** Estrutura dos painéis: barra lateral fixa no computador e gaveta no telemóvel. */
export function DashboardShell({ brand, title, subtitle, nav, children, logoutAction, topRight, bottomNav, variant = "courier", footerLinks = [] }: {
  brand: React.ReactNode;
  title: string;
  subtitle?: string;
  nav: NavItem[];
  children: React.ReactNode;
  logoutAction: () => Promise<void>;
  topRight?: React.ReactNode;
  bottomNav?: NavItem[];
  variant?: Variant;
  footerLinks?: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const t = THEME[variant];
  const isActive = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  const link = (i: NavItem) => {
    const Icon = ICONS[i.icon];
    const active = isActive(i);
    return (
      <li key={i.href}>
        <Link href={i.href} prefetch={false} aria-current={active ? "page" : undefined} className={cn("flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition", active ? t.active : t.idle)}>
          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="flex-1 truncate">{i.label}</span>
          {i.badge ? <span className={cn("rounded-full px-1.5 text-xs font-bold", active ? "bg-white/25" : t.badgeIdle)}>{i.badge}</span> : null}
        </Link>
      </li>
    );
  };
  // Agrupa itens consecutivos com a mesma secção
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const i of nav) {
    const last = groups[groups.length - 1];
    if (last && last.section === i.section) last.items.push(i);
    else groups.push({ section: i.section, items: [i] });
  }
  const links = (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={g.section ?? gi}>
          {g.section && <p className={cn("px-3 pb-1 text-[11px] font-bold uppercase tracking-wider", t.muted)}>{g.section}</p>}
          <ul className="space-y-0.5">{g.items.map(link)}</ul>
        </div>
      ))}
    </div>
  );
  const footer = (
    <div className={cn("space-y-0.5 border-t p-3 pb-safe", t.border)}>
      {footerLinks.map((l) => (
        <Link key={l.href} href={l.href} prefetch={false} className={cn("flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", t.idle)}>
          <ExternalLink className="h-[18px] w-[18px]" aria-hidden /> {l.label}
        </Link>
      ))}
      <form action={logoutAction}><button className={cn("flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium", t.danger)}><LogOut className="h-[18px] w-[18px]" /> Terminar sessão</button></form>
    </div>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className={cn("sticky top-0 hidden h-dvh flex-col border-r lg:flex", t.aside, t.border)}>
        <div className={cn("border-b px-4 py-4", t.border)}>{brand}<p className={cn("mt-2 truncate text-xs font-semibold uppercase tracking-wide", t.muted)}>{title}</p>{subtitle && <p className="truncate text-sm font-semibold">{subtitle}</p>}</div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label={title}>{links}</nav>
        {footer}
      </aside>
      <div className="min-w-0">
        <header className={cn("sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 pt-safe lg:hidden", t.header, t.border)}>
          <button onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5" aria-label="Abrir menu" aria-expanded={open}><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{subtitle ?? title}</p>{subtitle && <p className={cn("truncate text-[11px]", t.muted)}>{title}</p>}</div>
          {topRight}
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} aria-label="Fechar menu" />
            <div className={cn("absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col shadow-xl animate-slide-up pt-safe", t.aside)}>
              <div className={cn("flex items-start justify-between border-b px-4 py-4", t.border)}>
                <div className="min-w-0">{brand}<p className="mt-2 truncate text-sm font-semibold">{subtitle ?? title}</p></div>
                <button onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label="Fechar"><X className="h-5 w-5" /></button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3" aria-label={title}>{links}</nav>
              {footer}
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
                    <Link href={i.href} prefetch={false} className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium", active ? (variant === "partner" ? "text-accent" : "text-brand") : "text-muted")}>
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
