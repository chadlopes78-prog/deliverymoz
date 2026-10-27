import { SupportList, type SupportSP } from "../suporte/support-list";
import { HELP_CATEGORIES } from "@/server/services/support";

export const metadata = { title: "Pedidos de ajuda" };

export default async function HelpRequests({ searchParams }: { searchParams: Promise<SupportSP> }) {
  return <SupportList sp={await searchParams} base="/admin/pedidos-de-ajuda" title="Pedidos de ajuda" categories={HELP_CATEGORIES} />;
}
