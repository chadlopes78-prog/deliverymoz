import { FinanceView, type FinanceSP } from "../financeiro/finance-view";

export const metadata = { title: "Transações" };

export default async function Transactions({ searchParams }: { searchParams: Promise<FinanceSP> }) {
  return <FinanceView sp={await searchParams} base="/admin/transacoes" title="Transações" defaultTab="transacoes" />;
}
