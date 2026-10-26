import type { Metadata } from "next";
import { getSettings } from "@/server/services/settings";
import { RichText } from "@/components/rich-text";
import { defaultTerms } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de utilização" };

export default async function TermsPage() {
  const s = await getSettings();
  return <div className="mx-auto max-w-3xl px-4 py-8"><RichText text={s.termsContent || defaultTerms(s.platformName, s.companyLegalName || s.platformName)} /></div>;
}
