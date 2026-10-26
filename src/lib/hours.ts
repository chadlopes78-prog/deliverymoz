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
