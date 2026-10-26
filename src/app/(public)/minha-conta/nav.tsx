"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/minha-conta", label: "Perfil" },
  { href: "/minha-conta/pedidos", label: "Pedidos" },
  { href: "/minha-conta/favoritos", label: "Favoritos" },
  { href: "/minha-conta/enderecos", label: "Endereços" },
  { href: "/minha-conta/notificacoes", label: "Notificações" },
  { href: "/minha-conta/seguranca", label: "Segurança" },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Minha conta" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
      {items.map((i) => {
        const active = i.href === "/minha-conta" ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold", active ? "bg-brand/10 text-brand" : "text-muted hover:bg-ink/5 hover:text-ink")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
