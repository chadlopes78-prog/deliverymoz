"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button-class";

/** Volta a carregar os dados do servidor sem recarregar a página. */
export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className={cn(buttonClass("outline", "sm"), className)} aria-label="Atualizar lista">
      <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} aria-hidden /> {pending ? "A atualizar…" : "Atualizar"}
    </button>
  );
}
