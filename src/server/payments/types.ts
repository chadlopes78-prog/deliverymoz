import type { PaymentProviderKey } from "@prisma/client";

export type ProviderOutcome =
  | { status: "PAID"; providerTransactionId?: string; conversationId?: string; raw?: unknown }
  | { status: "FAILED"; failureCode?: string; failureMessage: string; raw?: unknown }
  /** Resultado ainda desconhecido (ex.: timeout). Deve ser reconciliado com consulta de estado. */
  | { status: "PROCESSING"; providerTransactionId?: string; conversationId?: string; raw?: unknown };

export type PaymentForProvider = {
  id: string;
  reference: string;
  amountCents: number;
  currency: string;
  payerPhone: string | null;
  providerTransactionId: string | null;
  orderCode: string;
};

export type WebhookResult = {
  eventId: string;
  reference: string;
  outcome: ProviderOutcome;
};

export interface PaymentProvider {
  key: PaymentProviderKey;
  defaultName: string;
  /** ONLINE: confirmação pelo fornecedor; OFFLINE: pagamento recebido presencialmente (numerário). */
  kind: "ONLINE" | "OFFLINE";
  requiresPhone: boolean;
  /** Variáveis de ambiente em falta para operar. Lista vazia = configurado. */
  missingConfig(): string[];
  /** Explicação do estado da integração para o painel de administração. */
  integrationNote: string;
  initiate?(p: PaymentForProvider): Promise<ProviderOutcome>;
  queryStatus?(p: PaymentForProvider): Promise<ProviderOutcome>;
  refund?(p: PaymentForProvider, amountCents: number): Promise<{ ok: boolean; reference?: string; message?: string; raw?: unknown }>;
  /** Valida a assinatura e interpreta um webhook. Deve lançar erro se a assinatura for inválida. */
  parseWebhook?(rawBody: string, headers: Headers): Promise<WebhookResult>;
}
