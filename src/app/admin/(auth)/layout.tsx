import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Administração", template: "%s · Administração" }, robots: { index: false, follow: false } };

/** Layout das páginas de acesso administrativo: sem cabeçalho público nem seleção de localização. */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-ink/[0.04] to-brand/[0.06] px-4 py-10">{children}</div>;
}
