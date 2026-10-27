import { str, optStr, bool } from "./action";
import { AppError } from "./errors";
import { parseMoneyToCents } from "@/lib/money";
import { timeToMinutes } from "@/lib/utils";

/** Lê os campos do editor de produto (partilhado pelo painel do restaurante e pelo Admin). */
export function productInputFromForm(fd: FormData) {
  const price = parseMoneyToCents(str(fd, "price"));
  if (price == null || price < 0) throw new AppError("VALIDATION", "Indique um preço válido.");
  let groups: unknown = [];
  try {
    groups = JSON.parse(str(fd, "optionGroups") || "[]");
  } catch {
    throw new AppError("VALIDATION", "Opções inválidas.");
  }
  const from = optStr(fd, "availableFrom");
  const until = optStr(fd, "availableUntil");
  const prep = optStr(fd, "prepTimeMinutes");
  if (prep && !/^\d+$/.test(prep)) throw new AppError("VALIDATION", "Tempo de preparação inválido.");
  return {
    name: str(fd, "name"),
    description: optStr(fd, "description"),
    priceCents: price,
    categoryId: optStr(fd, "categoryId"),
    status: bool(fd, "paused") ? ("PAUSED" as const) : ("ACTIVE" as const),
    isFeatured: bool(fd, "isFeatured"),
    availableFrom: from ? timeToMinutes(from) : null,
    availableUntil: until ? timeToMinutes(until) : null,
    prepTimeMinutes: prep ? Number(prep) : null,
    optionGroups: groups,
  };
}

/** Lê os turnos do editor de horários. */
export function hoursFromForm(fd: FormData) {
  const hours: { dayOfWeek: number; opensAt: number; closesAt: number }[] = [];
  for (let d = 0; d < 7; d++) {
    const opens = fd.getAll(`opens-${d}`).map(String);
    const closes = fd.getAll(`closes-${d}`).map(String);
    opens.forEach((o, i) => {
      if (!o && !closes[i]) return;
      const a = timeToMinutes(o);
      const b = timeToMinutes(closes[i] ?? "");
      if (a == null || b == null) throw new AppError("VALIDATION", "Horário inválido. Use o formato HH:MM.");
      hours.push({ dayOfWeek: d, opensAt: a, closesAt: b });
    });
  }
  return hours;
}

/** Coordenada opcional (aceita vírgula decimal). */
export function optCoord(fd: FormData, k: string) {
  const v = optStr(fd, k);
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) throw new AppError("VALIDATION", "Coordenadas inválidas.");
  return n;
}
