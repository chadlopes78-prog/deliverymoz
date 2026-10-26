/** Todos os valores monetários circulam em unidades menores (centavos). */
export function formatMoney(cents: number, currency = "MZN", locale = "pt-MZ"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Converte texto introduzido ("150", "150,50", "1 200.00") em centavos. */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

/** Aplica uma percentagem expressa em pontos-base com arredondamento ao centavo. */
export function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10000);
}
