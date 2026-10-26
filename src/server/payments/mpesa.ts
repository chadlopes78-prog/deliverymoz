import { publicEncrypt, constants } from "node:crypto";
import type { PaymentProvider, PaymentForProvider, ProviderOutcome } from "./types";

/**
 * Integração M-Pesa (Vodacom Moçambique) — API "IPG v1x".
 *
 * Fonte: o portal oficial https://developer.mpesa.vm.co.mz/ exige registo para consultar a documentação.
 * Os anfitriões, portas e caminhos abaixo coincidem entre os SDKs comunitários publicados
 * (ex.: @paymentsds/mpesa e mpesa-mz-nodejs-lib). VERIFICAR no portal oficial antes de ativar em produção.
 *
 *   C2B (single stage):   POST https://{host}:18352/ipg/v1x/c2bPayment/singleStage/
 *   Consulta de estado:   GET  https://{host}:18353/ipg/v1x/queryTransactionStatus/
 *   Reversão:             PUT  https://{host}:18354/ipg/v1x/reversal/
 *   Sandbox: api.sandbox.vm.co.mz   Produção: api.mpesa.vm.co.mz
 *
 * Autenticação: "Authorization: Bearer <base64(RSA-PKCS1v1.5(api_key, public_key))>" e cabeçalho "Origin".
 * O pedido C2B é síncrono: a resposta chega depois de o cliente confirmar no telemóvel (ou expirar).
 * Esta API não envia webhooks; estados incertos são reconciliados por consulta de estado.
 */

const env = () => ({
  apiKey: process.env.MPESA_API_KEY ?? "",
  publicKey: process.env.MPESA_PUBLIC_KEY ?? "",
  serviceProviderCode: process.env.MPESA_SERVICE_PROVIDER_CODE ?? "",
  origin: process.env.MPESA_ORIGIN ?? "",
  host: process.env.MPESA_API_HOST ?? (process.env.MPESA_ENV === "live" ? "api.mpesa.vm.co.mz" : "api.sandbox.vm.co.mz"),
  initiatorIdentifier: process.env.MPESA_INITIATOR_IDENTIFIER ?? "",
  securityCredential: process.env.MPESA_SECURITY_CREDENTIAL ?? "",
  timeoutMs: Number(process.env.MPESA_TIMEOUT_MS ?? 90_000),
});

export function mpesaBearer(apiKey: string, publicKeyB64: string): string {
  const pem = publicKeyB64.includes("BEGIN PUBLIC KEY")
    ? publicKeyB64
    : `-----BEGIN PUBLIC KEY-----\n${publicKeyB64.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  const encrypted = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(apiKey));
  return `Bearer ${encrypted.toString("base64")}`;
}

/** Mensagens para códigos de resposta conhecidos. Códigos desconhecidos são registados tal como recebidos. */
const MPESA_MESSAGES: Record<string, string> = {
  "INS-1": "Erro interno do M-Pesa. Tente novamente.",
  "INS-5": "A transação foi cancelada no telemóvel.",
  "INS-6": "A transação falhou.",
  "INS-9": "O pedido expirou: a confirmação não foi feita a tempo.",
  "INS-10": "Transação duplicada.",
  "INS-2006": "Saldo insuficiente na conta M-Pesa.",
  "INS-2051": "Número de telefone inválido para M-Pesa.",
};

/** Referências do M-Pesa devem ser alfanuméricas. */
const alnum = (s: string, max = 20) => s.replace(/[^A-Za-z0-9]/g, "").slice(0, max);

function toMsisdn(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (/^2588[45]\d{7}$/.test(d)) return d;
  if (/^8[45]\d{7}$/.test(d)) return `258${d}`;
  return null;
}

async function call(method: "GET" | "POST" | "PUT", port: number, path: string, body?: Record<string, string>, query?: Record<string, string>) {
  const e = env();
  const url = new URL(`https://${e.host}:${port}${path}`);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: e.origin,
      Authorization: mpesaBearer(e.apiKey, e.publicKey),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(e.timeoutMs),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = { parseError: true, httpStatus: res.status };
  }
  return { httpStatus: res.status, json };
}

export const mpesaProvider: PaymentProvider = {
  key: "MPESA",
  defaultName: "M-Pesa",
  kind: "ONLINE",
  requiresPhone: true,
  integrationNote:
    "C2B síncrono, consulta de estado e reversão implementados segundo a API IPG v1x. Requer credenciais do portal Vodacom M-Pesa e validação dos endpoints no portal oficial.",
  missingConfig() {
    const e = env();
    const missing: string[] = [];
    if (!e.apiKey) missing.push("MPESA_API_KEY");
    if (!e.publicKey) missing.push("MPESA_PUBLIC_KEY");
    if (!e.serviceProviderCode) missing.push("MPESA_SERVICE_PROVIDER_CODE");
    if (!e.origin) missing.push("MPESA_ORIGIN");
    return missing;
  },

  async initiate(p: PaymentForProvider): Promise<ProviderOutcome> {
    const msisdn = toMsisdn(p.payerPhone);
    if (!msisdn) return { status: "FAILED", failureCode: "INVALID_MSISDN", failureMessage: "Número M-Pesa inválido (84 ou 85)." };
    if (p.currency !== "MZN") return { status: "FAILED", failureCode: "CURRENCY", failureMessage: "M-Pesa aceita apenas MZN." };
    try {
      const { httpStatus, json } = await call("POST", 18352, "/ipg/v1x/c2bPayment/singleStage/", {
        input_TransactionReference: alnum(p.orderCode),
        input_CustomerMSISDN: msisdn,
        input_Amount: (p.amountCents / 100).toFixed(2),
        input_ThirdPartyReference: alnum(p.reference),
        input_ServiceProviderCode: env().serviceProviderCode,
      });
      return interpret(httpStatus, json);
    } catch (err) {
      // Timeout ou falha de rede: o resultado é incerto — não marcar como falhado nem como pago.
      return { status: "PROCESSING", raw: { error: String(err).slice(0, 300) } };
    }
  },

  async queryStatus(p: PaymentForProvider): Promise<ProviderOutcome> {
    try {
      const { httpStatus, json } = await call("GET", 18353, "/ipg/v1x/queryTransactionStatus/", undefined, {
        input_ThirdPartyReference: alnum(p.reference),
        input_QueryReference: p.providerTransactionId ?? alnum(p.reference),
        input_ServiceProviderCode: env().serviceProviderCode,
      });
      const code = String(json.output_ResponseCode ?? "");
      const txStatus = String(json.output_ResponseTransactionStatus ?? "");
      if (httpStatus < 300 && code === "INS-0" && txStatus.toLowerCase() === "completed") {
        return { status: "PAID", providerTransactionId: p.providerTransactionId ?? undefined, raw: json };
      }
      if (["cancelled", "expired", "failed", "reversed"].includes(txStatus.toLowerCase())) {
        return { status: "FAILED", failureCode: txStatus, failureMessage: `Estado no M-Pesa: ${txStatus}`, raw: json };
      }
      return { status: "PROCESSING", raw: json };
    } catch (err) {
      return { status: "PROCESSING", raw: { error: String(err).slice(0, 300) } };
    }
  },

  async refund(p, amountCents) {
    const e = env();
    if (!e.initiatorIdentifier || !e.securityCredential) {
      return { ok: false, message: "Reversão M-Pesa requer MPESA_INITIATOR_IDENTIFIER e MPESA_SECURITY_CREDENTIAL." };
    }
    if (!p.providerTransactionId) return { ok: false, message: "Transação M-Pesa sem identificador." };
    try {
      const { httpStatus, json } = await call("PUT", 18354, "/ipg/v1x/reversal/", {
        input_ReversalAmount: (amountCents / 100).toFixed(2),
        input_TransactionID: p.providerTransactionId,
        input_ThirdPartyReference: alnum(`R${p.reference}`),
        input_ServiceProviderCode: e.serviceProviderCode,
        input_InitiatorIdentifier: e.initiatorIdentifier,
        input_SecurityCredential: e.securityCredential,
      });
      const ok = httpStatus < 300 && json.output_ResponseCode === "INS-0";
      return {
        ok,
        reference: (json.output_TransactionID as string) ?? undefined,
        message: ok ? undefined : String(json.output_ResponseDesc ?? json.output_ResponseCode ?? "Reversão falhou"),
        raw: json,
      };
    } catch (err) {
      return { ok: false, message: `Falha de comunicação: ${String(err).slice(0, 200)}` };
    }
  },
};

export function interpret(httpStatus: number, json: Record<string, unknown>): ProviderOutcome {
  const code = String(json.output_ResponseCode ?? "");
  if (httpStatus < 300 && code === "INS-0") {
    return {
      status: "PAID",
      providerTransactionId: (json.output_TransactionID as string) || undefined,
      conversationId: (json.output_ConversationID as string) || undefined,
      raw: json,
    };
  }
  if (!code) return { status: "PROCESSING", raw: json };
  return {
    status: "FAILED",
    failureCode: code,
    failureMessage: MPESA_MESSAGES[code] ?? String(json.output_ResponseDesc ?? `Pagamento recusado (${code}).`),
    raw: json,
  };
}
