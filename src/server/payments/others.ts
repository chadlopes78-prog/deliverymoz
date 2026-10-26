import { createHmac } from "node:crypto";
import type { PaymentProvider } from "./types";
import { safeEqual } from "../auth/tokens";

/**
 * e-Mola (Movitel): não existe documentação pública oficial. O acesso à API (serviço USSD Push)
 * é entregue pela Movitel apenas após contrato. A estrutura está pronta; falta o adaptador
 * baseado na especificação oficial que a Movitel fornecer.
 */
export const emolaProvider: PaymentProvider = {
  key: "EMOLA",
  defaultName: "e-Mola",
  kind: "ONLINE",
  requiresPhone: true,
  integrationNote:
    "Integração por implementar: requer contrato com a Movitel e a especificação oficial da API. Permanece desativado.",
  missingConfig: () => ["Contrato e documentação oficial da Movitel (adaptador não implementado)"],
};

/**
 * Cartões bancários: depende do gateway escolhido (ex.: banco adquirente local).
 * Nenhum fornecedor foi definido, por isso nenhum endpoint é assumido.
 */
export const cardProvider: PaymentProvider = {
  key: "CARD",
  defaultName: "Cartão bancário",
  kind: "ONLINE",
  requiresPhone: false,
  integrationNote:
    "Por implementar: escolher um gateway de cartões disponível em Moçambique e implementar o adaptador. Nunca guardar dados de cartão.",
  missingConfig: () => ["Gateway de cartões não escolhido (adaptador não implementado)"],
};

/** Pagamento em numerário na entrega: confirmado por quem entrega, no momento da entrega. */
export const cashProvider: PaymentProvider = {
  key: "CASH_ON_DELIVERY",
  defaultName: "Pagamento na entrega (numerário)",
  kind: "OFFLINE",
  requiresPhone: false,
  integrationNote: "Não depende de fornecedor externo. O recebimento é confirmado por quem entrega.",
  missingConfig: () => [],
};

/**
 * Fornecedor exclusivo do ambiente de testes automatizados (NODE_ENV=test).
 * Nunca é registado noutros ambientes e não processa dinheiro real.
 */
export const testProvider: PaymentProvider = {
  key: "TEST",
  defaultName: "Fornecedor de testes",
  kind: "ONLINE",
  requiresPhone: false,
  integrationNote: "Apenas para testes automatizados.",
  missingConfig: () => (process.env.TEST_WEBHOOK_SECRET ? [] : ["TEST_WEBHOOK_SECRET"]),
  async initiate() {
    return { status: "PROCESSING" };
  },
  async queryStatus() {
    return { status: "PROCESSING" };
  },
  async refund() {
    return { ok: true, reference: "TEST-REFUND" };
  },
  async parseWebhook(rawBody, headers) {
    const sig = headers.get("x-test-signature") ?? "";
    const expected = createHmac("sha256", process.env.TEST_WEBHOOK_SECRET ?? "").update(rawBody).digest("hex");
    if (!sig || !safeEqual(sig, expected)) throw new Error("INVALID_SIGNATURE");
    const body = JSON.parse(rawBody) as { id: string; reference: string; status: string; transactionId?: string };
    return {
      eventId: body.id,
      reference: body.reference,
      outcome:
        body.status === "paid"
          ? { status: "PAID", providerTransactionId: body.transactionId, raw: body }
          : body.status === "failed"
            ? { status: "FAILED", failureCode: "DECLINED", failureMessage: "Pagamento recusado.", raw: body }
            : { status: "PROCESSING", raw: body },
    };
  },
};
