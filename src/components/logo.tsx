import Link from "next/link";
import { getSettings } from "@/server/services/settings";
import { fileUrl } from "@/server/storage/files";
import { cn } from "@/lib/utils";

export async function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  const s = await getSettings();
  return (
    <Link href={href} className={cn("flex shrink-0 items-center gap-2", className)} aria-label={`${s.platformName} — início`}>
      {s.logoFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(s.logoFileId)!} alt="" className="h-9 w-9 rounded-xl object-cover" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-contrast" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M5 9h14l-1.2 9.2A2 2 0 0 1 15.8 20H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 9c0-2.2 1.3-4 3-4s3 1.8 3 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        </span>
      )}
      {!compact && <span className="text-lg font-extrabold tracking-tight">{s.platformName}</span>}
    </Link>
  );
}
