import { FinanceView, type FinanceSP } from "../financeiro/finance-view";

export const metadata = { title: "Vendas" };

export default async function Sales({ searchParams }: { searchParams: Promise<FinanceSP> }) {
  return <FinanceView sp={await searchParams} base="/admin/vendas" title="Vendas" defaultTab="resumo" />;
}
