import { SupportList, type SupportSP } from "../suporte/support-list";
import { COMPLAINT_CATEGORIES } from "@/server/services/support";

export const metadata = { title: "Reclamações" };

export default async function Complaints({ searchParams }: { searchParams: Promise<SupportSP> }) {
  return <SupportList sp={await searchParams} base="/admin/reclamacoes" title="Reclamações" categories={COMPLAINT_CATEGORIES} />;
}
