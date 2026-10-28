import { addDays, weekday, type DayKey } from '../streak';

export type DayXp = {
  day: DayKey;
  /** 0 = lunes … 6 = domingo. */
  weekday: number;
  xp: number;
};

/** XP ganado en cada uno de los últimos `days` días, del más antiguo al de `today`; 0 si no hubo. */
export function recentXp(
  xpByDay: Readonly<Record<DayKey, number>>,
  today: DayKey,
  days = 7,
): DayXp[] {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - (days - 1));
    return { day, weekday: weekday(day) ?? 0, xp: xpByDay[day] ?? 0 };
  });
}
