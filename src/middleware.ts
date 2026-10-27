import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/admin", "/parceiro", "/entregador", "/minha-conta", "/checkout", "/acompanhar"];
const PUBLIC_EXCEPTIONS = ["/parceiro/registo", "/entregador/registo", "/admin/login", "/admin/sem-acesso"];

/**
 * Verificação rápida: sem cookie de sessão, redireciona para o login antes de renderizar.
 * A autorização completa (sessão válida, funções e permissões) é sempre feita no servidor.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !PUBLIC_EXCEPTIONS.includes(pathname);
  if (needsAuth && !req.cookies.get("dm_session")?.value) {
    const url = req.nextUrl.clone();
    // A área administrativa tem um login próprio, separado da experiência dos clientes.
    url.pathname = pathname === "/admin" || pathname.startsWith("/admin/") ? "/admin/login" : "/entrar";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/parceiro/:path*", "/entregador/:path*", "/minha-conta/:path*", "/checkout", "/acompanhar/:path*"],
};
