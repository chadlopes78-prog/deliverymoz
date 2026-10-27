import { SupportList, type SupportSP } from "./support-list";

export const metadata = { title: "Suporte" };

export default async function Support({ searchParams }: { searchParams: Promise<SupportSP> }) {
  return <SupportList sp={await searchParams} base="/admin/suporte" title="Suporte e reclamações" />;
}

