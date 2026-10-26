import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "green" | "yellow" | "red" | "blue" | "purple";
const tones: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink/80",
  brand: "bg-brand/10 text-brand",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15",
  yellow: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-1 ring-red-600/15",
  blue: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/15",
  purple: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/15",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}
