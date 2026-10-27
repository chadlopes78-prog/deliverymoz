import Link from "next/link";
import { Bell, Search, ChevronDown, LogOut, ExternalLink, UserRound } from "lucide-react";

/** Pesquisa global, notificações e conta do administrador (cabeçalho do centro de controlo). */
export function AdminHeaderTools({ name, email, role, unread, logoutAction, compact = false }: { name: string; email: string | null; role: string; unread: number; logoutAction: () => Promise<void>; compact?: boolean }) {
  const bell = (
    <Link href="/admin/notificacoes" prefetch={false} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-ink/5" aria-label={`Notificações${unread ? ` (${unread} por ler)` : ""}`}>
      <Bell className="h-5 w-5" />
      {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-contrast">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/admin/pesquisa" prefetch={false} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/10" aria-label="Pesquisar"><Search className="h-5 w-5" /></Link>
        {bell}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <form action="/admin/pesquisa" role="search" className="relative hidden xl:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input name="q" type="search" placeholder="Pesquisar restaurantes, pedidos, contas…" aria-label="Pesquisa global" className="h-10 w-80 rounded-xl border border-line bg-bg pl-9 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
      </form>
      <Link href="/admin/pesquisa" prefetch={false} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-ink/5 xl:hidden" aria-label="Pesquisar"><Search className="h-5 w-5" /></Link>
      {bell}
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-brand-contrast" aria-hidden>{name.charAt(0).toUpperCase()}</span>
          <span className="hidden min-w-0 text-left 2xl:block"><span className="block max-w-40 truncate text-sm font-semibold">{name}</span><span className="block text-xs text-muted">{role}</span></span>
          <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
          <span className="sr-only">Conta do administrador</span>
        </summary>
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-lg">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <p className="mt-1 text-xs font-semibold text-brand">{role}</p>
          </div>
          <Link href="/minha-conta" prefetch={false} className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ink/5"><UserRound className="h-4 w-4" /> A minha conta</Link>
          <Link href="/" prefetch={false} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ink/5"><ExternalLink className="h-4 w-4" /> Ver o site</Link>
          <form action={logoutAction}><button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Terminar sessão</button></form>
        </div>
      </details>
    </div>
  );
}
