/** Día calendario en formato `AAAA-MM-DD`. */
export type DayKey = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Día calendario de un instante en la zona horaria del usuario (AD-13).
 * Si la zona no es válida usa UTC.
 */
export function dayKey(nowMs: number, timeZone: string): DayKey {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(nowMs);
  try {
    return format(timeZone);
  } catch {
    return format('UTC');
  }
}

/** Número de día desde 1970-01-01 (calendario gregoriano), sin usar fechas del sistema. */
function dayNumber(day: DayKey): number | null {
  const m = DAY.exec(day);
  if (!m) return null;
  const y0 = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (month < 1 || month > 12 || d < 1 || d > 31) return null;
  const y = month <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Días entre dos días calendario (positivo si `to` es posterior); nulo si alguno es inválido. */
export function daysBetween(from: DayKey, to: DayKey): number | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  return a === null || b === null ? null : b - a;
}

/** Mes de un día, `AAAA-MM`. */
export function monthKey(day: DayKey): string {
  return day.slice(0, 7);
}
