import type { Metadata } from "next";
import { getSettings } from "@/server/services/settings";
import { RichText } from "@/components/rich-text";
import { defaultPrivacy } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default async function PrivacyPage() {
  const s = await getSettings();
  return <div className="mx-auto max-w-3xl px-4 py-8"><RichText text={s.privacyContent || defaultPrivacy(s.platformName, s.companyLegalName || s.platformName)} /></div>;
}
