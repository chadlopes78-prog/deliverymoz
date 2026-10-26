import type { PaymentProviderKey } from "@prisma/client";
import type { PaymentProvider } from "./types";
import { mpesaProvider } from "./mpesa";
import { cardProvider, cashProvider, emolaProvider, testProvider } from "./others";

const providers: Partial<Record<PaymentProviderKey, PaymentProvider>> = {
  MPESA: mpesaProvider,
  EMOLA: emolaProvider,
  CARD: cardProvider,
  CASH_ON_DELIVERY: cashProvider,
};
if (process.env.NODE_ENV === "test") providers.TEST = testProvider;

export function getProvider(key: PaymentProviderKey): PaymentProvider | null {
  return providers[key] ?? null;
}

export function listProviders(): PaymentProvider[] {
  return Object.values(providers) as PaymentProvider[];
}
