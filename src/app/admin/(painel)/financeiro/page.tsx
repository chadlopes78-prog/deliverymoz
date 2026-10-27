import { FinanceView, type FinanceSP } from "./finance-view";

export const metadata = { title: "Financeiro" };

export default async function Finance({ searchParams }: { searchParams: Promise<FinanceSP> }) {
  return <FinanceView sp={await searchParams} base="/admin/financeiro" title="Financeiro" defaultTab="resumo" />;
}
