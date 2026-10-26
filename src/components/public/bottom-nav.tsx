"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Receipt, User, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Início", icon: Home, match: (p: string) => p === "/" },
  { href: "/restaurantes", label: "Buscar", icon: Search, match: (p: string) => p.startsWith("/restaurante") },
  { href: "/sacola", label: "Sacola", icon: ShoppingBag, match: (p: string) => p.startsWith("/sacola") || p.startsWith("/checkout") },
  { href: "/minha-conta/pedidos", label: "Pedidos", icon: Receipt, match: (p: string) => p.startsWith("/minha-conta/pedidos") || p.startsWith("/acompanhar") },
  { href: "/minha-conta", label: "Conta", icon: User, match: (p: string) => p === "/minha-conta" || (p.startsWith("/minha-conta/") && !p.startsWith("/minha-conta/pedidos")) },
];

/** Navegação inferior para uso com uma só mão em telemóveis. */
export function BottomNav({ cartCount }: { cartCount: number }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe md:hidden" aria-label="Navegação principal">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link href={href} className={cn("relative flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-medium", active ? "text-brand" : "text-muted")} aria-current={active ? "page" : undefined}>
                <Icon className="h-5 w-5" aria-hidden />
                {label}
                {href === "/sacola" && cartCount > 0 && (
                  <span className="absolute top-1 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-contrast">{cartCount}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
