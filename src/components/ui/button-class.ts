import { cn } from "@/lib/utils";

export type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
export type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-contrast hover:brightness-95 active:brightness-90 shadow-sm",
  accent: "bg-accent text-white hover:brightness-95 active:brightness-90 shadow-sm",
  secondary: "bg-ink/5 text-ink hover:bg-ink/10",
  outline: "border border-line bg-surface text-ink hover:bg-ink/5",
  ghost: "text-ink hover:bg-ink/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-13 px-6 text-base rounded-xl",
  icon: "h-10 w-10 rounded-full",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-semibold transition select-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    variants[variant],
    sizes[size],
    className,
  );
}

