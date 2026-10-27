import Link from "next/link";
import { Bike, Receipt, Store, ArrowRight } from "lucide-react";

/**
 * Atalhos de categoria da página inicial.
 * Quando existem categorias (cozinhas) na base de dados, são essas as mostradas.
 * Sem categorias, mostra atalhos de pesquisa: cada um abre a pesquisa real com esse termo
 * (não inventa restaurantes nem resultados).
 */
const SHORTCUTS = [
  { label: "Pizza", q: "pizza", emoji: "🍕", tone: "bg-orange-100" },
  { label: "Hambúrguer", q: "hamburguer", emoji: "🍔", tone: "bg-amber-100" },
  { label: "Frango", q: "frango", emoji: "🍗", tone: "bg-red-100" },
  { label: "Mariscos", q: "camarão", emoji: "🦐", tone: "bg-rose-100" },
  { label: "Lanches", q: "lanche", emoji: "🥪", tone: "bg-yellow-100" },
  { label: "Saudável", q: "salada", emoji: "🥗", tone: "bg-lime-100" },
  { label: "Doces", q: "bolo", emoji: "🍰", tone: "bg-pink-100" },
  { label: "Bebidas", q: "sumo", emoji: "🥤", tone: "bg-sky-100" },
];
const TONES = SHORTCUTS.map((s) => s.tone);

export function CategoryShortcuts({ cuisines }: { cuisines: { id: string; slug: string; name: string; emoji: string | null }[] }) {
  const items = cuisines.length
    ? cuisines.map((c, i) => ({ key: c.id, label: c.name, emoji: c.emoji ?? "🍽️", tone: TONES[i % TONES.length], href: `/restaurantes?categoria=${c.slug}` }))
    : SHORTCUTS.map((s) => ({ key: s.q, label: s.label, emoji: s.emoji, tone: s.tone, href: `/restaurantes?q=${encodeURIComponent(s.q)}` }));
  return (
    <nav className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:gap-5" aria-label="Categorias">
      {items.map((c) => (
        <Link key={c.key} href={c.href} className="group flex w-[4.5rem] shrink-0 flex-col items-center gap-2 text-center sm:w-20">
          <span className={`grid h-16 w-16 place-items-center rounded-2xl text-3xl transition group-hover:-translate-y-0.5 group-hover:shadow-md sm:h-20 sm:w-20 sm:text-4xl ${c.tone}`} aria-hidden>
            {c.emoji}
          </span>
          <span className="line-clamp-2 text-xs font-semibold leading-tight group-hover:text-brand sm:text-sm">{c.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Cartões informativos da plataforma (não são promoções nem descontos). */
export function InfoCards({ loggedIn }: { loggedIn: boolean }) {
  const cards = [
    loggedIn
      ? { href: "/minha-conta/pedidos", icon: Receipt, title: "Os teus pedidos", text: "Acompanha cada etapa: recebido, em preparação, a caminho e entregue.", cta: "Ver pedidos", cls: "from-[#E8452C] to-[#c7321c] text-white" }
      : { href: "/registar", icon: Receipt, title: "Cria a tua conta", text: "Guarda moradas, acompanha pedidos e repete os teus pratos favoritos.", cta: "Criar conta", cls: "from-[#E8452C] to-[#c7321c] text-white" },
    { href: "/parceiro/registo", icon: Store, title: "Tens um restaurante?", text: "Publica o teu menu e recebe pedidos num painel feito para restaurantes.", cta: "Registar restaurante", cls: "from-[#1F7A5A] to-[#155e45] text-white" },
    { href: "/entregador/registo", icon: Bike, title: "Faz entregas", text: "Candidata-te como entregador e escolhe quando queres trabalhar.", cta: "Quero ser entregador", cls: "from-[#2b2d33] to-[#12141a] text-white" },
  ];
  return (
    <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className={`group relative flex min-h-40 w-[82vw] max-w-sm shrink-0 snap-start flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-5 md:w-auto md:max-w-none ${c.cls}`}>
          <c.icon className="absolute -right-4 -bottom-4 h-28 w-28 opacity-15" aria-hidden />
          <div className="relative">
            <p className="text-lg font-extrabold leading-tight">{c.title}</p>
            <p className="mt-1 max-w-[16rem] text-sm opacity-90">{c.text}</p>
          </div>
          <span className="relative mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-ink">
            {c.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      ))}
    </div>
  );
}
