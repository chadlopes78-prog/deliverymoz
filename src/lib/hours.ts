/** Utilitários de horário. Os horários são interpretados no fuso horário da plataforma. */
export function localTimeParts(date: Date, timeZone: string): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: days.indexOf(parts.weekday as string), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export type Hour = { dayOfWeek: number; opensAt: number; closesAt: number };

export function isOpenAt(hours: Hour[], date: Date, timeZone: string): boolean {
  if (!hours.length) return false;
  const { day, minutes } = localTimeParts(date, timeZone);
  const prevDay = (day + 6) % 7;
  return hours.some((h) => {
    if (h.closesAt > h.opensAt) return h.dayOfWeek === day && minutes >= h.opensAt && minutes < h.closesAt;
    // Turno que atravessa a meia-noite
    if (h.dayOfWeek === day && minutes >= h.opensAt) return true;
    if (h.dayOfWeek === prevDay && minutes < h.closesAt) return true;
    return false;
  });
}

export function isWithinWindow(from: number | null, until: number | null, date: Date, timeZone: string) {
  if (from == null || until == null) return true;
  const { minutes } = localTimeParts(date, timeZone);
  return until > from ? minutes >= from && minutes < until : minutes >= from || minutes < until;
}

/** Desvio (minutos) de um fuso horário num instante. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Converte "AAAA-MM-DDTHH:mm" (hora local da plataforma) para Date UTC. */
export function zonedToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}

/** Formata uma data UTC como valor de <input type="datetime-local"> na hora da plataforma. */
export function utcToLocalInput(date: Date | null | undefined, timeZone: string): string {
  if (!date) return "";
  const shifted = new Date(date.getTime() + tzOffsetMinutes(date, timeZone) * 60000);
  return shifted.toISOString().slice(0, 16);
}
