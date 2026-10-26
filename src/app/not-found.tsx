import Link from "next/link";
import { buttonClass } from "@/components/ui/button-class";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-extrabold text-brand">404</p>
        <h1 className="mt-2 text-xl font-bold">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted">A página que procura não existe ou foi removida.</p>
        <Link href="/" className={buttonClass("primary", "md", "mt-5")}>Voltar ao início</Link>
      </div>
    </div>
  );
}
