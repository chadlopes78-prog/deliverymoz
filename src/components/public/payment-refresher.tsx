"use client";
import { useCallback } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { refreshPaymentAction } from "@/app/(public)/actions";

export function PaymentRefresher({ code }: { code: string }) {
  const tick = useCallback(() => refreshPaymentAction(code), [code]);
  return <AutoRefresh seconds={8} onTick={tick} />;
}
