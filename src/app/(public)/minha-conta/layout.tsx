import { requireUser } from "@/server/guards";
import { AccountNav } from "./nav";
import { logoutAction } from "../actions";
import { LogOut } from "lucide-react";

export const metadata = { title: "Minha conta", robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/minha-conta");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <p className="text-sm text-muted">Olá,</p>
      <h1 className="text-xl font-bold sm:text-2xl">{user.name}</h1>
      <div className="mt-5 grid gap-6 md:grid-cols-[200px_1fr]">
        <aside className="min-w-0 space-y-2">
          <AccountNav />
          <form action={logoutAction} className="hidden md:block">
            <button className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Terminar sessão</button>
          </form>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
