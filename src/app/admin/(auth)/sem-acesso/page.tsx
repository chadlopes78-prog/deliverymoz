import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getSessionUser } from "@/server/auth/session";
import { buttonClass } from "@/components/ui/button-class";
import { logoutAction } from "@/app/(public)/actions";

export const metadata = { title: "Acesso recusado" };

export default async function NoAccess() {
  const user = await getSessionUser();
  return (
    <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-center shadow-sm sm:p-8">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><ShieldX className="h-6 w-6" /></span>
      <h1 className="mt-4 text-2xl font-bold">Acesso recusado</h1>
      <p className="mt-2 text-sm text-muted">{user ? <>A conta <strong>{user.email ?? user.name}</strong> não tem permissões para a área administrativa.</> : "Precisa de uma conta administrativa para continuar."}</p>
      <div className="mt-6 grid gap-2">
        <Link href="/" className={buttonClass("primary", "md", "w-full")}>Ir para o site</Link>
        {user && <form action={logoutAction}><button className={buttonClass("outline", "md", "w-full")}>Terminar sessão e entrar com outra conta</button></form>}
      </div>
    </div>
  );
}
