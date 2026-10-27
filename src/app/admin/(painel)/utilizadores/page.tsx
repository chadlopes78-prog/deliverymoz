import { requireAdmin } from "@/server/guards";
import { UsersList, type UsersSP } from "./users-list";

export const metadata = { title: "Utilizadores" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<UsersSP> }) {
  await requireAdmin("customers.view");
  return <UsersList sp={await searchParams} base="/admin/utilizadores" title="Utilizadores" description="Todas as contas da plataforma: compradores, parceiros, entregadores e administradores." />;
}
