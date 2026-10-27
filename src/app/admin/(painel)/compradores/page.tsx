import { requireAdmin } from "@/server/guards";
import { UsersList, type UsersSP } from "../utilizadores/users-list";

export const metadata = { title: "Compradores" };

export default async function AdminBuyers({ searchParams }: { searchParams: Promise<UsersSP> }) {
  await requireAdmin("customers.view");
  return <UsersList sp={await searchParams} base="/admin/compradores" title="Compradores" description="Contas de clientes que fazem pedidos. Abra uma conta para ver o histórico de pedidos ou suspender o acesso." fixedProfile="comprador" />;
}
