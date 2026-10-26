import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getSettings } from "@/server/services/settings";
import { contrastColor, safeHex } from "@/lib/brand";
import { fileUrl } from "@/server/storage/files";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const base = s.siteUrl || process.env.APP_URL || "http://localhost:3000";
  const description = s.tagline || `Peça comida dos seus restaurantes favoritos com ${s.platformName}.`;
  return {
    metadataBase: new URL(base),
    title: { default: s.platformName, template: `%s · ${s.platformName}` },
    description,
    applicationName: s.platformName,
    openGraph: { type: "website", siteName: s.platformName, title: s.platformName, description, locale: "pt_MZ" },
    icons: s.logoFileId ? { icon: fileUrl(s.logoFileId)! } : { icon: "/icon.svg" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getSettings();
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: safeHex(s.primaryColor, "#E8452C") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const brand = safeHex(s.primaryColor, "#E8452C");
  const accent = safeHex(s.accentColor, "#1F7A5A");
  const style = { "--brand": brand, "--brand-contrast": contrastColor(brand), "--accent": accent } as React.CSSProperties;
  return (
    <html lang="pt" style={style} className={jakarta.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
