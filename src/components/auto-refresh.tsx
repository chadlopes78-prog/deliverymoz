"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atualiza a página periodicamente enquanto estiver visível (polling eficiente, compatível com serverless).
 * `onTick` pode executar uma Server Action antes da atualização (ex.: consultar estado do pagamento).
 */
export function AutoRefresh({ seconds = 15, onTick }: { seconds?: number; onTick?: () => Promise<void> }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible" || stopped) return;
      try {
        if (onTick) await onTick();
      } catch {
        /* rede instável: tenta no próximo ciclo */
      }
      router.refresh();
    }, seconds * 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [router, seconds, onTick]);
  return null;
}
