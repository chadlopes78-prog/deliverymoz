import Link from "next/link";
import { Heart } from "lucide-react";
import { requireUser } from "@/server/guards";
import { listRestaurants } from "@/server/services/catalog";
import { getSettings } from "@/server/services/settings";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button-class";
import { RestaurantCard } from "@/components/public/restaurant-card";

export default async function FavoritesPage() {
  const user = await requireUser("/minha-conta/favoritos");
  const [list, s] = await Promise.all([listRestaurants({ favoritesOf: user.id }), getSettings()]);
  if (!list.length) return <EmptyState icon={Heart} title="Ainda não tem favoritos" description="Toque no coração na página de um restaurante para o guardar aqui." action={<Link href="/restaurantes" className={buttonClass()}>Explorar</Link>} />;
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">Restaurantes favoritos</h2>
      <div className="grid gap-1 sm:grid-cols-2">{list.map((r) => <RestaurantCard key={r.id} r={r} currency={s.currency} />)}</div>
    </div>
  );
}
