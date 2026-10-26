import "server-only";
import { ZodError } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { isAppError } from "./errors";
import { logError } from "./audit";

export type ActionResult = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown> } | null;

/** Converte erros de domínio/validação em mensagens seguras para o utilizador. Erros inesperados são registados. */
export async function runAction(fn: () => Promise<ActionResult | void>, successMessage?: string): Promise<ActionResult> {
  try {
    const r = await fn();
    return r ?? { ok: true, message: successMessage };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (isAppError(e)) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = issue.path.join(".");
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos.", fieldErrors };
    }
    await logError("action", e);
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v ? v : null;
}
export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
export function int(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}
export function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function file(fd: FormData, key: string): File | null {
  const f = fd.get(key);
  return f instanceof File && f.size > 0 ? f : null;
}
