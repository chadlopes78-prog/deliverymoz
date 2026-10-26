import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Converte "HH:MM" em minutos desde a meia-noite. */
export function timeToMinutes(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Normaliza números moçambicanos para o formato 258XXXXXXXXX. */
export function normalizeMzPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "").replace(/^00/, "");
  if (/^8[2-7]\d{7}$/.test(digits)) return `258${digits}`;
  if (/^2588[2-7]\d{7}$/.test(digits)) return digits;
  return null;
}

export function formatPhone(p?: string | null): string {
  if (!p) return "";
  const m = /^258(\d{2})(\d{3})(\d{4})$/.exec(p);
  return m ? `+258 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export function maskPhone(p?: string | null): string {
  if (!p) return "";
  return p.length > 4 ? `${"•".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : p;
}
